# YT Tutor

A personal YouTube player with an AI research sidebar and a persistent per-project notebook. Paste a YouTube URL, watch the video, ask Claude anything about it, and save what matters to a notebook that outlives any single session.

Built for solo use — self-hosted, single user, runs on a VPS.

---

## What it does

YT Tutor replaces the experience of watching YouTube alone. Instead of pausing to open a new tab, googling something, losing your place, and forgetting what you were thinking — you have a three-panel interface:

```
┌──────────────────────┬───────────────────┬───────────────────────┐
│  Video player        │  AI Chat          │  Notebook (TipTap)    │
│  (YouTube)           │  (Claude)         │  (autosave)           │
│                      │                   │                       │
│  [Chapters][Transc.] │                   │                       │
└──────────────────────┴───────────────────┴───────────────────────┘
```

- **Left:** YouTube video player. Below it: a two-column transcript panel — chapters on the left, full transcript on the right — both synced to playback. Watch history accessible via a dropdown in the URL bar.
- **Center:** AI chat powered by Claude — ask anything, get streaming markdown responses, full conversation history persists per project.
- **Right:** Rich-text notebook that autosaves, one per project.

---

## Features

### Projects
- Multiple named projects, like browser tabs or NotebookLM workspaces
- Each project has its own independent chat history, notebook, and watch history
- Switch between projects instantly from the tab bar at the top
- Rename projects by double-clicking the tab
- Everything persists — close the browser, come back, pick up exactly where you left off

### Video Player
- Paste any YouTube URL (full URL, `youtu.be` short link, Shorts, embed URL, or bare video ID)
- Video persists across page reloads — the same video reloads automatically at the timestamp you left it (no autoplay; video is ready but waits for you to press play)
- Watch history recorded per project; accessible via the clock icon button in the URL bar (dropdown, lazy-loaded; selecting a video loads it in the player)

### AI Chat
- Powered by Claude (`claude-sonnet-4-6`) with streaming responses (up to 4096 tokens)
- **"Start conversation" button** — when a video is loaded, click to kick off the session; Claude generates 4 suggested questions and, if no YouTube description chapters were found, automatically generates video chapters from the transcript
- **Suggestion chips** — appear above the input whenever a video is loaded; click to pre-fill the textarea (editable before sending); refresh at any time with the "Suggest" button
- **Loading indicator** — bottom bar shows "Loading video…" while the transcript and metadata are being fetched
- Suggestions are context-aware: on a fresh start Claude picks broad, interesting questions freely; once chapters exist, suggestions focus on the current chapter; with conversation history, they build on what's been discussed
- **Video only (default):** Claude draws exclusively on the full transcript — no outside knowledge; best for staying focused on the material
- **Open knowledge (toggle):** Unlocks Claude's general knowledge in addition to the transcript — useful for broader questions
- The full transcript is always sent as context (prompt-cached — after the first message, transcript tokens cost 10% of normal)
- Chat history is a continuous log across all videos watched in a project
- When you load a new video, a system message appears inline: *"Started watching: Video Title"*
- Assistant responses render as markdown (bold, lists, code blocks, tables, etc.)
- **Copy to notebook** — hover any AI response to reveal a "→ Notebook" button; copies the full message with markdown formatting preserved (bold, lists, headings, code blocks all transfer as rich text)
- Text selection in chat also pops up a "Copy to notebook" button for partial copies
- Graceful error handling for API credit issues, rate limits, and network errors

### Chapters
- Sourced in priority order: **DB-cached chapters** → **YouTube description chapters** → **Claude-generated chapters**
- **YouTube description chapters** — if the video has timestamps in its description (the standard YouTube chapters format), they are parsed automatically on load with no AI call required; auto-saved to DB on first fetch
- **Claude-generated chapters** — if no YouTube chapters exist, clicking "Start conversation" triggers Claude to analyse the full transcript and identify 4–8 topic chapters; these are saved to DB and never overwritten by subsequent fetches
- Displayed in the left column of the transcript panel; clicking any chapter seeks the player to that point
- Active chapter highlighted with a blue tint background and auto-scrolled as the video plays
- Timestamps display as `m:ss` or `h:mm:ss` depending on video length
- Chapters reset automatically when a new video is loaded

### Transcript Panel
- Always visible below the video player — shows a loading skeleton while fetching, empty state if unavailable
- **DB-cached:** transcript is saved to the database on first load; subsequent visits to the same video skip the YouTube fetch entirely and use the cached copy
- Two-stage fetch (first load only): direct scrape of YouTube's caption data first; falls back to `yt-dlp` for videos where YouTube's session-bound URLs block server-side access
- Two-column layout when chapters are available: chapters on the left, full transcript on the right
- Active segment highlighted with a blue left-border indicator and auto-scrolled to as the video plays; active segment kept at ~25% from the top of the panel
- Pauses auto-scroll for 5 seconds when you manually scroll, then resumes
- **Click any line to jump the video to that timestamp**
- Text is selectable

### Copy to Notebook
- **Per-message button:** hover any AI response → "→ Notebook" appears; copies the full message as formatted rich text (markdown preserved — bullets become real lists, bold stays bold, etc.)
- **Selection popup:** select any text in the chat → "Copy to notebook" floats above your selection; appends as plain text
- Both methods append to the end of the current notebook and trigger autosave

### Notebook
- Rich text editor (TipTap) with a formatting toolbar: bold, italic, strikethrough, H1/H2, bullet lists, ordered lists, blockquotes, inline code
- Debounced autosave — saves 800ms after you stop typing, silently in the background
- "saved / saving… / unsaved" status indicator in the header
- One notebook per project; content persists across sessions

### Watch History
- Per-project list of every video watched, with relative timestamps ("5m ago", "2h ago")
- Accessible via the clock icon button to the left of the YouTube URL input (opens a dropdown)
- Each entry links to the video on YouTube (opens in a new tab)
- Refreshes automatically when a new video loads

### Dark Mode
- Follows your system preference automatically (`prefers-color-scheme`)
- No manual toggle needed — switches instantly with your OS

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript, Tailwind CSS v4) |
| Database | SQLite via Prisma 6 |
| Auth | NextAuth v5 (credentials provider, single user) |
| AI | Anthropic Claude API (streaming, prompt caching) |
| Video playback | YouTube IFrame Player API |
| Transcripts & metadata | YouTube Data API v3 + yt-dlp fallback |
| Rich text | TipTap 3 with StarterKit |
| Markdown rendering | react-markdown + remark-gfm |
| Markdown → rich text | unified + remark-parse + remark-gfm (mdast → HTML → TipTap) |
| Process manager | PM2 (VPS deployment) |

---

## Prerequisites

- Node.js 18+
- npm
- **yt-dlp** — used as a fallback transcript fetcher for videos where YouTube blocks server-side caption access
- A [YouTube Data API v3 key](https://console.cloud.google.com/) — for fetching video metadata
- An [Anthropic API key](https://console.anthropic.com/) — for Claude AI chat

---

## Installation

```bash
git clone https://github.com/powerfool/yt_tutor.git
cd yt_tutor
npm install
npx prisma generate
```

Install yt-dlp (required for transcript fallback):

```bash
# macOS
brew install yt-dlp

# Linux / VPS
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
chmod +x /usr/local/bin/yt-dlp
```

---

## Configuration

Copy `.env.example` to `.env` and fill in all values:

```bash
cp .env.example .env
```

```env
DATABASE_URL="file:./prisma/dev.db"

# NextAuth — generate AUTH_SECRET with: openssl rand -base64 32
AUTH_SECRET="your-random-secret"
AUTH_URL="http://localhost:3000"

# Single admin user credentials
ADMIN_USERNAME="your-username"

# Generate a bcrypt hash of your password (cost factor 10):
#   node -e "const b = require('bcryptjs'); b.hash('your-password', 10).then(console.log)"
# Then escape every $ with \$ in the .env file:
ADMIN_PASSWORD_HASH=\$2b\$10\$...your-hash-here...

# API keys — server-side only, never sent to the browser
ANTHROPIC_API_KEY="sk-ant-..."
YOUTUBE_API_KEY="AIza..."
```

> **Important:** Every `$` in the bcrypt hash **must** be escaped as `\$` in the `.env` file. Next.js uses `dotenv-expand` which interprets unescaped `$` as variable references and will corrupt the hash silently.

---

## Running Locally

```bash
# Apply database migrations
npx prisma migrate dev

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll be redirected to `/login` — sign in with the username and password you configured above.

---

## Database Management

```bash
# Apply schema changes (creates a migration file)
npx prisma migrate dev --name describe-your-change

# Inspect the database in a browser GUI
npx prisma studio

# Regenerate the Prisma client after schema changes
npx prisma generate
```

---

## Deployment (VPS with PM2)

```bash
# First-time setup on the server
npm ci
npx prisma migrate deploy
npm run build
pm2 start ecosystem.config.js
pm2 save

# Subsequent deploys
npm ci
npx prisma migrate deploy
npm run build
pm2 restart yt-tutor

# View logs
pm2 logs yt-tutor
```

Make sure `.env` is populated on the server and `AUTH_URL` points to your public domain (e.g. `https://yourdomain.com`).

---

## Project Structure

```
src/
  app/
    login/                     Login page (unauthenticated)
    project/[id]/              Main project page (three-panel layout)
    api/
      auth/                    NextAuth handler
      chat/                    Streaming Claude API route
        suggest/               POST — generate context-aware suggested questions
        chapters/              POST — generate topic chapters from transcript
      projects/                GET all projects, POST new project
      projects/[id]/           PATCH (rename, set current video), DELETE project
        messages/              GET + POST chat messages for a project
        notebook/              GET + PATCH notebook content
        watch-history/         GET + POST watch history
      youtube/[videoId]/       GET video title + transcript (server-side proxy)
  components/
    ProjectTabBar.tsx           Top tab bar — list, create, rename, delete projects
    ProjectClient.tsx           Client shell — shared video/transcript/chapter/player state
    VideoPanel.tsx              YouTube IFrame player + URL bar + history dropdown + timestamp persistence
    TranscriptPanel.tsx         Two-column layout: chapters (left) + timestamp-synced transcript (right)
    ChatPanel.tsx               Streaming AI chat, suggestions, video-only toggle, copy-to-notebook
    NotebookPanel.tsx           TipTap editor — toolbar, autosave, appendText + appendMarkdown
    WatchHistoryPanel.tsx       (used inside VideoPanel dropdown) per-project watched videos
  lib/
    youtube.ts                  Client-safe helpers (parseVideoId, TranscriptSegment, Chapter types)
    youtube.server.ts           Server-only transcript + metadata fetch (Node.js + yt-dlp)
    markdownToTiptap.ts         Markdown → HTML via mdast walk; used for rich-text notebook insertion
    prisma.ts                   Prisma singleton with absolute DB path resolution
  auth.ts                       NextAuth v5 config (credentials provider)
  proxy.ts                      Auth middleware — redirects unauthenticated requests
prisma/
  schema.prisma                 Data model
  dev.db                        SQLite database (gitignored)
ecosystem.config.js             PM2 process config
```

---

## Data Model

```
Project       id, name, currentVideoId, createdAt, updatedAt
WatchHistory  id, projectId, videoId, videoTitle, watchedAt, transcriptJson, chapters
Message       id, projectId, role (user|assistant|system), content, videoId, createdAt
Notebook      id, projectId, content (TipTap JSON string), updatedAt
```

- One notebook per project (auto-created on first access)
- Chat messages are a continuous log scoped to the project, not to individual videos
- `currentVideoId` on Project stores the last-watched video for reload persistence; playback timestamp is stored in `localStorage` keyed by project ID
- `transcriptJson` on WatchHistory caches the full transcript after the first fetch — subsequent loads of the same video skip the YouTube API call entirely
- `chapters` on WatchHistory caches parsed or Claude-generated chapters; once saved, they are never overwritten by new fetches

---

## Security

- All API routes require a valid session — unauthenticated requests return 401
- YouTube and Anthropic API keys live in server-side env vars only, never sent to the browser
- All YouTube and Claude API calls are proxied through Next.js API routes
- CSRF protection via NextAuth built-ins
- SQLite database file lives outside the web root

---

## Known Limitations

- **Single user only** — no multi-user or role support
- **Transcripts require captions** — videos without captions will show "unavailable" in the transcript tab
- **Transcript fetching is best-effort** — the primary path scrapes `ytInitialPlayerResponse` from YouTube's page HTML; if YouTube changes that format it may break. The yt-dlp fallback is more resilient but adds a few seconds of latency
- **No export integrations** — copy-paste is the only way to get content out of the notebook for now
