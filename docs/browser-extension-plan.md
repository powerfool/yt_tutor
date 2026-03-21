# Browser Extension — Architecture Plan

## Concept

A Manifest V3 Chrome extension that reads transcripts directly from the YouTube page DOM.
No server required — transcripts are read from the page, the Anthropic API is called directly
from the background service worker using the user's own key.

## Why This Solves the Transcript Problem

The content script runs alongside the YouTube page. `ytInitialPlayerResponse` is already a
live parsed JS object on `window` — no HTTP request, no IP blocking, no CORS.

---

## UI / Layout

The extension renders as a **Chrome Side Panel** — the native browser panel that opens on the
right side of the screen, persistent while the user watches YouTube.

### Two-pane layout

Chat and Notebook live side-by-side inside the side panel. A single cycle button in the header
rotates through three layout states. Chat is always on the left, Notebook always on the right.

```
┌─────────────────────────────────────────────────────────────────┐
│  YT Tutor                                    [⚙] [layout btn]   │
│  ─────────────────────────────────────────────────────────────  │
│                          │                                       │
│        Chat              │           Notebook                   │
│       (left, flex-1)     │          (right, flex-1)             │
│                          │                                       │
└─────────────────────────────────────────────────────────────────┘
```

### Layout cycle

Clicking the layout button advances to the next state. The button label/icon always reflects
the **next** state (what clicking it will do), not the current one.

| Current state | Button shows | Next state |
|---------------|--------------|------------|
| Chat only | + Notebook | Chat + Notebook |
| Chat + Notebook | Hide Chat | Notebook only |
| Notebook only | + Chat | Chat only |

### Auto-open notebook

When the user sends text to the notebook (via "→ Notebook" selection popup or the hover button
on assistant messages), the layout automatically advances to the next state that includes the
Notebook pane (i.e. if currently "Chat only", jumps to "Chat + Notebook").

### Non-YouTube page

Side panel shows: *"Open a YouTube video to get started."*

### No captions available

Chat panel shows: *"No captions available for this video — chat will work without transcript
context."* Chat still functions, just without grounding.

---

## Feature Parity

### Chat panel

Full parity with the web app's ChatPanel:

- **Streaming responses** — via Anthropic API through the background service worker
- **Video-only toggle** — restricts Claude to video content only; on by default
- **"Start conversation" button** — shown before first message for a given video; clicking it
  fetches topic suggestions and enters the chat input state
- **Topic suggestions** — "Suggest" button in header; also auto-loaded on "Start conversation";
  clicking a suggestion populates the input
- **Selection popup** — select any text in the chat → floating pill appears with two actions:
  "Quote in chat" (prefixes selection as `> blockquote` into the input) and "→ Notebook"
- **Copy whole message to notebook** — hover button beneath each assistant message ("→ Notebook")
- **API key banner** — shown if no Anthropic key is configured; links to Settings
- **Clear chat** button — clears all messages for the current video (with confirmation)
- **Markdown rendering** — assistant messages rendered with ReactMarkdown + remark-gfm
- **System pills** — "Started watching: [video title]" pill posted when the user navigates to
  a new video; not re-posted on page reload if it already exists in history

### Notebook panel

- **Tiptap rich text editor** — same toolbar as the web app:
  Bold, Italic, Strikethrough, H1, H2, Bullet list, Ordered list, Blockquote, Inline code
- **Persistent across videos** — one global notebook stored under a single
  `chrome.storage.local` key (`notebook`); not scoped per video or per project
- **Auto-save** — debounced 800ms after last change; shows saved / saving… / unsaved status
- **appendText / appendMarkdown** — public methods called by Chat when content is sent to
  the notebook; markdown is converted to Tiptap JSON nodes via the existing
  `markdownToTiptapContent` utility

### Settings panel

- Accessible via a gear icon in the side panel header
- Anthropic API key entry — stored in `chrome.storage.local`
- YouTube API key entry (optional) — stored in `chrome.storage.local`
- No server, no auth

---

## Directory Structure

```
extension/
├── manifest.json              # MV3: sidePanel, scripting, storage, youtube.com permissions
├── background.ts              # Service worker: Anthropic streaming + message routing
├── content/
│   └── youtube.ts             # Transcript extraction — see note on Firefox isolation below
├── sidebar/
│   ├── index.html
│   ├── main.tsx               # Entry point
│   └── App.tsx                # Shell: header with toggle pills + pane layout
└── components/
    ├── ChatPanel.tsx           # Adapted: fetch() → chrome.runtime.sendMessage()
    ├── NotebookPanel.tsx       # Adapted: fetch() → chrome.storage.local; no projectId prop
    └── SettingsPanel.tsx       # API key management
```

---

## Transcript Extraction (content/youtube.ts)

Wrapped in an exported function so the implementation can be swapped for Firefox (see Phase 2).

```typescript
export async function extractTranscript() {
  const player = (window as any).ytInitialPlayerResponse;
  const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  if (tracks.length === 0) {
    chrome.runtime.sendMessage({ type: 'TRANSCRIPT_UNAVAILABLE',
      videoId: player?.videoDetails?.videoId,
      videoTitle: player?.videoDetails?.title });
    return;
  }
  const captionUrl = new URL(tracks[0].baseUrl);
  captionUrl.searchParams.set('fmt', 'json3');
  const data = await fetch(captionUrl.toString()).then(r => r.json());
  chrome.runtime.sendMessage({
    type: 'TRANSCRIPT_READY',
    transcript: data,
    videoTitle: player.videoDetails.title,
    videoId: player.videoDetails.videoId,
  });
}
```

---

## Background Service Worker (background.ts)

Handles Anthropic streaming and topic suggestion calls. Service workers can fetch external
APIs without CORS issues. Streaming is forwarded to the sidebar via `chrome.tabs.sendMessage`.

```typescript
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'CHAT') {
    // 1. get anthropicApiKey from chrome.storage.local
    // 2. stream from Anthropic API (messages endpoint, prompt caching on transcript)
    // 3. forward each chunk to sidebar: chrome.runtime.sendMessage({ type: 'CHAT_CHUNK', chunk })
    // 4. send CHAT_DONE when stream ends
  }
  if (msg.type === 'SUGGEST') {
    // 1. get key from storage
    // 2. call Anthropic with suggestion prompt
    // 3. return suggestions array
  }
  return true; // keep channel open for async
});
```

---

## Component Adaptations

### ChatPanel.tsx

| Web app | Extension |
|---------|-----------|
| `fetch("/api/chat", ...)` | `chrome.runtime.sendMessage({ type: 'CHAT', payload })` + listen for `CHAT_CHUNK` / `CHAT_DONE` |
| `fetch("/api/chat/suggest", ...)` | `chrome.runtime.sendMessage({ type: 'SUGGEST', payload })` |
| `fetch("/api/projects/[id]/messages")` | `chrome.storage.local.get('messages_<videoId>')` |
| `fetch("/api/settings")` | `chrome.storage.local.get('anthropicApiKey')` |
| `onCopyToNotebook` prop | calls `notebookRef.current.appendText(text)` + opens notebook pane |
| `onCopyMarkdownToNotebook` prop | calls `notebookRef.current.appendMarkdown(md)` + opens notebook pane |

### NotebookPanel.tsx

| Web app | Extension |
|---------|-----------|
| `fetch("/api/projects/[id]/notebook")` | `chrome.storage.local.get('notebook')` |
| `fetch(..., { method: 'PATCH' })` | `chrome.storage.local.set({ notebook: content })` |
| `projectId` prop | removed — single global notebook |

---

## Storage Schema

All persistence via `chrome.storage.local`:

| Key | Value | Notes |
|-----|-------|-------|
| `anthropicApiKey` | string | User's Anthropic API key |
| `youtubeApiKey` | string | Optional YouTube API key |
| `messages_<videoId>` | `Message[]` | Chat history per video |
| `notebook` | TipTap JSON string | Single persistent notebook |
| `layoutState` | `"chat" \| "both" \| "notebook"` | Last known layout state, restored on reopen |

---

## Build Tooling

Vite + `@crxjs/vite-plugin` for React + TypeScript + hot reload during development.

---

## Implementation Order

1. `manifest.json` scaffold with all required permissions (`sidePanel`, `scripting`, `storage`,
   `tabs`, host permission for `*://*.youtube.com/*` and `https://api.anthropic.com/*`)
2. Content script: `extractTranscript()` function + `TRANSCRIPT_READY` / `TRANSCRIPT_UNAVAILABLE` messages
3. Sidebar shell (`App.tsx`): header with layout cycle button, two-pane layout, cycle logic
   (`"chat" → "both" → "notebook" → "chat"`), auto-advance to notebook on append
4. Background worker: Anthropic chat streaming + suggestion calls via messages
5. `ChatPanel.tsx` adaptation: all `fetch()` calls → `chrome.runtime.sendMessage()`
6. `NotebookPanel.tsx` adaptation: `fetch()` → `chrome.storage.local`, remove `projectId`
7. `SettingsPanel.tsx`: API key entry, gear icon in header
8. Message history persistence in `chrome.storage.local` keyed by video ID
9. `layoutState` persistence — restore last layout state on reopen

---

## Phase 2 — Firefox Support

Firefox uses a different sidebar API and isolates content scripts from the page's JS context.
The following changes are needed:

### 1. Sidebar API abstraction

Chrome uses `chrome.sidePanel`; Firefox uses `browser.sidebarAction`. These have different
manifest keys and different APIs for opening/closing. Wrap all sidebar open/close calls in a
single `openSidebar()` / `closeSidebar()` utility so the rest of the code is browser-agnostic.

### 2. Content script window isolation

Firefox content scripts run in a sandboxed JS context — `window.ytInitialPlayerResponse` is
not accessible directly. The fix is to inject a `<script>` tag into the page DOM, read
`ytInitialPlayerResponse` there, and `postMessage` the data back to the content script:

```typescript
// Firefox transcript extraction
const script = document.createElement('script');
script.textContent = `
  window.postMessage({
    type: '__YTT_PLAYER_DATA__',
    player: window.ytInitialPlayerResponse
  }, '*');
`;
document.documentElement.appendChild(script);
script.remove();

window.addEventListener('message', (e) => {
  if (e.data?.type === '__YTT_PLAYER_DATA__') {
    // proceed with e.data.player
  }
});
```

The `extractTranscript()` function boundary introduced in Phase 1 means only this function
needs a Firefox-specific implementation — nothing else changes.

### 3. API normalisation

Add `webextension-polyfill` to normalise `chrome.*` (callback-based) vs `browser.*`
(Promise-based) across both browsers. This is a mechanical find-and-replace of `chrome.`
with `browser.` after installing the polyfill.

### 4. Build tooling

`@crxjs/vite-plugin` is Chrome-only. Switch to `vite-plugin-web-extension` which supports
both browsers and can produce separate build outputs from a shared source.

### 5. Manifest differences

Firefox requires `browser_specific_settings.gecko.id` in `manifest.json`. Generate
browser-specific manifests at build time from a shared `manifest.base.json`:

```json
// manifest.base.json additions for Firefox
{
  "browser_specific_settings": {
    "gecko": { "id": "yt-tutor@yourdomain.com", "strict_min_version": "109.0" }
  },
  "sidebar_action": {
    "default_panel": "sidebar/index.html",
    "default_title": "YT Tutor"
  }
}
```
