# YT Tutor — Browser Extension

Chrome extension (Manifest V3) that reads transcripts directly from the YouTube page DOM and provides a persistent side panel with Chat + Notebook, powered by the Anthropic API.

## Setup

```bash
cd extension
npm install
npm run build    # produces extension/dist/
# or
npm run dev      # watch mode for development
```

Then in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select `extension/dist/`
4. Click the YT Tutor icon in the toolbar to open the side panel
5. Open Settings (⚙) and add your Anthropic API key

## Architecture

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest: sidePanel, scripting, storage, tabs |
| `background.ts` | Service worker: Anthropic API streaming + state management |
| `content/youtube.ts` | Reads `ytInitialPlayerResponse` from YouTube page DOM |
| `sidebar/App.tsx` | Shell: layout cycle (chat / both / notebook), settings toggle |
| `components/ChatPanel.tsx` | Full chat UI, messages via `chrome.storage.local` |
| `components/NotebookPanel.tsx` | Tiptap editor, persistent via `chrome.storage.local` |
| `components/SettingsPanel.tsx` | API key management |
| `lib/markdownToTiptap.ts` | Shared markdown → Tiptap JSON converter |

## Storage Schema

| Key | Value |
|-----|-------|
| `anthropicApiKey` | Anthropic API key string |
| `youtubeApiKey` | YouTube API key string (optional) |
| `messages_<videoId>` | `Message[]` — chat history per video |
| `transcript_<videoId>` | `TranscriptSegment[]` — parsed transcript |
| `title_<videoId>` | Video title string |
| `notebook` | Tiptap JSON string — single global notebook |
| `layoutState` | `"chat" \| "both" \| "notebook"` |
| `currentVideoId` | Active video ID (persists across service worker restarts) |
| `currentVideoTitle` | Active video title |
| `currentHasTranscript` | boolean |

## Phase 2 — Firefox Support

See `docs/browser-extension-plan.md` for the full Firefox migration plan (sidebar API abstraction, window isolation for content scripts, `webextension-polyfill`, `vite-plugin-web-extension`).
