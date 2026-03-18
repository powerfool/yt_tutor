# Browser Extension — Architecture Plan

## Concept

A Manifest V3 Chrome extension that reads transcripts directly from the YouTube page DOM.
No server required for transcripts/chapters — uses browser's own IP and cookies.
Anthropic API called directly from the background service worker with user's own key.

## Why This Solves the Transcript Problem

The content script runs in the YouTube page's JS context.
`ytInitialPlayerResponse` is already a live parsed JS object on `window` — no HTTP request,
no IP blocking, no CORS.

## Directory Structure

```
extension/
├── manifest.json          # MV3: sidePanel, scripting, storage, youtube.com permissions
├── background.js          # Service worker: streams Anthropic API responses
├── content/
│   └── youtube.js         # Reads ytInitialPlayerResponse, fetches captions, sends to sidebar
├── sidebar/
│   ├── index.html
│   ├── main.tsx           # Entry point
│   └── App.tsx            # Sidebar shell: video info + tabs
└── components/            # Adapted from src/components/
    ├── ChatPanel.tsx       # Reused — fetch() calls replaced with chrome.runtime.sendMessage()
    └── NotebookPanel.tsx   # Reused — storage replaced with chrome.storage.local
```

## Transcript Extraction (content/youtube.js)

```javascript
const player = window.ytInitialPlayerResponse;
const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
const captionUrl = new URL(tracks[0].baseUrl);
captionUrl.searchParams.set('fmt', 'json3');
const transcript = await fetch(captionUrl).then(r => r.json());
chrome.runtime.sendMessage({
  type: 'TRANSCRIPT_READY',
  transcript,
  videoTitle: player.videoDetails.title,
  videoId: player.videoDetails.videoId,
});
```

## Component Adaptations

### ChatPanel.tsx
Replace `fetch("/api/chat", ...)` with `chrome.runtime.sendMessage({ type: "CHAT", payload: {...} })`.
Settings check: use `chrome.storage.local.get('anthropicApiKey')` instead of `/api/settings`.

### NotebookPanel.tsx
Replace `fetch("/api/projects/[id]/notebook", ...)` with `chrome.storage.local.set/get`.

### Settings
Small settings panel in sidebar. Store API key in `chrome.storage.local`.
No server needed.

## Background Service Worker (background.js)

Handles Anthropic streaming. Service workers can fetch external APIs without CORS issues.

```javascript
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'CHAT') {
    // get key from chrome.storage.local
    // stream from Anthropic
    // forward chunks back to sidebar via chrome.tabs.sendMessage
  }
  return true; // keep channel open for async response
});
```

## Storage (replacing SQLite/Postgres)

Use `chrome.storage.local` for all persistence:
- `projects` — array of project objects
- `messages_<projectId>` — message arrays per project
- `notebook_<projectId>` — TipTap JSON per project
- `watchHistory_<projectId>` — watch history per project
- `anthropicApiKey` — user's Anthropic API key
- `settings` — prompt customizations

## Build Tooling

Vite + `@crxjs/vite-plugin` for React + TypeScript + hot reload during development.

## Implementation Order

1. `manifest.json` scaffold with all required permissions
2. Content script: transcript extraction + `TRANSCRIPT_READY` message
3. Sidebar shell: receives transcript, renders video title
4. Background worker: Anthropic streaming via messages
5. ChatPanel adaptation: `fetch` → `sendMessage`
6. NotebookPanel adaptation: `fetch` → `chrome.storage.local`
7. Settings panel: API key entry and storage
8. Message history persistence in `chrome.storage.local`
9. Multiple projects support
