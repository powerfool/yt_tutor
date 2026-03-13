# YT Tutor

A personal YouTube player with an AI research sidebar and a persistent per-project notebook. Paste a YouTube URL, watch the video, ask Claude anything about it mid-watch, and save what matters to a notebook that outlives any single session.

Built for solo use — self-hosted, single user, runs on a VPS.

---

## What it does

YT Tutor replaces the experience of watching YouTube alone. Instead of pausing to open a new tab, googling something, losing your place, and forgetting what you were thinking — you have a three-panel interface:

```
┌────────────────┬───────────────────┬───────────────────────┐
│  Video player  │  AI Chat          │  Notebook (TipTap)    │
│  (YouTube)     │  (Claude)         │  (autosave)           │
│                │                   │                       │
│  [Transcript]  │                   │                       │
│  [History  ]   │                   │                       │
└────────────────┴───────────────────┴───────────────────────┘
```

- **Left:** YouTube video player with a collapsible transcript panel and watch history below
- **Center:** AI chat powered by Claude — ask anything, get streaming answers, full conversation history persists per project
- **Right:** Rich-text notebook that autosaves, one per project

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
- Video persists across page reloads — the same video reloads automatically at the timestamp you left it
- Watch history recorded per project (video title + time watched)

### AI Chat
- Powered by Claude (`claude-sonnet-4-6`) with streaming responses
- **Default mode:** full Claude knowledge — ask about anything, not just the video
- **Video focus mode:** toggle on to restrict Claude to the video's transcript as context, useful when you want answers anchored to what was actually said in the video
- Chat history is a continuous log across all videos watched in a project
- When you load a new video, a system message appears inline: *"Started watching: Video Title"* — gives the thread a timeline feel as you scroll back
- Graceful error handling for API credit issues, rate limits, and network errors

### Transcript Panel
- Auto-fetched when a video loads
- Two-stage fetch: direct scrape of YouTube's caption data first; falls back to `yt-dlp` for videos where YouTube's session-bound URLs block server-side access
- Collapsible — toggled via the "Transcript" tab below the player
- Active segment highlighted in yellow and auto-scrolled to as the video plays
- Pauses auto-scroll for 5 seconds when you manually scroll, then resumes
- **Click any line to jump the video to that timestamp**
- Text is selectable and copyable
- Falls back gracefully when transcripts are unavailable (e.g. videos without captions)

### Copy to Notebook
- Select any text in the chat — a **"Copy to notebook"** button floats above your selection
- One click appends the selected text as a new paragraph in the notebook and triggers autosave
- No reformatting, no interruption to your flow

### Notebook
- Rich text editor (TipTap) with a formatting toolbar: bold, italic, strikethrough, H1/H2, bullet lists, ordered lists, blockquotes, inline code
- Debounced autosave — saves 800ms after you stop typing, silently in the background
- "Saved / Saving… / Unsaved" status indicator in the header
- One notebook per project; content persists across sessions
- Accepts text appended programmatically via the copy-to-notebook feature

### Watch History
- Per-project list of every video watched, with relative timestamps ("5m ago", "2h ago")
- Accessible via the "History" tab below the video player
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
| AI | Anthropic Claude API (streaming) |
| Video playback | YouTube IFrame Player API |
| Transcripts & metadata | YouTube Data API v3 + yt-dlp fallback |
| Rich text | TipTap 3 with StarterKit |
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
      projects/                GET all projects, POST new project
      projects/[id]/           PATCH (rename, set current video), DELETE project
        messages/              GET + POST chat messages for a project
        notebook/              GET + PATCH notebook content
        watch-history/         GET + POST watch history
      youtube/[videoId]/       GET video title + transcript (server-side proxy)
  components/
    ProjectTabBar.tsx           Top tab bar — list, create, rename projects
    ProjectClient.tsx           Client shell — shared video/transcript/player state
    VideoPanel.tsx              YouTube IFrame player + URL bar + timestamp persistence
    TranscriptPanel.tsx         Timestamp-synced transcript with auto-scroll
    ChatPanel.tsx               Streaming AI chat, video focus toggle, copy-to-notebook
    NotebookPanel.tsx           TipTap editor — toolbar, autosave, exposes appendText
    WatchHistoryPanel.tsx       Per-project list of watched videos with relative times
  lib/
    youtube.ts                  Client-safe helpers (parseVideoId, types)
    youtube.server.ts           Server-only transcript + metadata fetch (Node.js + yt-dlp)
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
WatchHistory  id, projectId, videoId, videoTitle, watchedAt
Message       id, projectId, role (user|assistant|system), content, videoId, createdAt
Notebook      id, projectId, content (TipTap JSON string), updatedAt
```

- One notebook per project (auto-created on first access)
- Chat messages are a continuous log scoped to the project, not to individual videos
- `currentVideoId` on Project stores the last-watched video for reload persistence; playback timestamp is stored in `localStorage` keyed by project ID

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
