# YT Tutor

**YT Tutor** turns passive YouTube watching into active learning. Paste a URL, and alongside the video you get an AI research partner and a personal notebook — all in one window, all saved automatically.

Self-hosted, runs on a VPS. Sign in with Google. API keys and AI prompts are configurable from the UI — no code changes needed after deploy.

![Screenshot](/screenshot.png "Screenshot")

---

## Features

### Chapters & Transcripts

Paste any YouTube URL and the video loads instantly. As it plays, a live transcript scrolls alongside it — click any line to jump the player to that moment. If the video has chapters, they appear in a panel on the left; YT Tutor will generate them automatically from the transcript if the video doesn't.

Your place is saved. Close the tab, come back later — the video resumes exactly where you left off.

---

### Ask Claude anything

A full AI chat panel sits next to the video, powered by Claude. Ask about something you just heard, request a summary, go deeper on a concept. Claude has the full transcript in context, so its answers are grounded in the actual video — not generic search results.

**Video only mode** (default) keeps Claude strictly on the video content — useful when you want answers from the source, not outside opinion. Toggle it off to bring in Claude's broader knowledge.

When you open a video, Claude suggests four questions to get you started. As the conversation develops, suggestions shift to follow what you've been discussing. You can refresh them any time.

**Quote in chat** — highlight any part of a response, hit "Quote in chat", and that text drops into your input as a blockquote. Ask a follow-up without retyping anything.

<img src="/1-chat.jpg" alt="Ask Claude" width="500" />

---

### Build a notebook

Everything worth keeping goes in the notebook — a rich text editor on the right. Hover any AI response to copy it straight to the notebook with full formatting intact (bullet points, bold text, code blocks — all preserved). Or select any text in chat and copy just that snippet.

The notebook autosaves as you type. One notebook per project, always waiting where you left it.

<img src="/2-notebook.jpg" alt="Project Notebook" width="500" />

---

### Organize with projects

Projects work like browser tabs for your research. Each one has its own video history, chat log, and notebook. Switch between them instantly from the tab bar. Rename them by double-clicking. Nothing bleeds between projects.

---

### Settings

A gear icon in the tab bar opens the settings page. Add your Anthropic and YouTube API keys directly in the UI — no config file edits needed after the first setup. You can also override any of the AI prompts if you want to tune how Claude behaves.

---

### Everything persists

- Chat history survives page reloads — scroll back through the full conversation
- Transcripts are cached after the first load — revisiting a video is instant
- Video timestamp, notebook content, chapters — all saved automatically
- Dark mode follows your system preference

---

## Tech Stack

| | |
|---|---|
| Framework | Next.js (App Router, TypeScript, Tailwind CSS v4) |
| Database | PostgreSQL via Prisma (Neon) |
| Auth | NextAuth v5 (Google OAuth, database sessions) |
| AI | Anthropic Claude API (streaming, prompt caching) |
| Video | YouTube IFrame Player API + Data API v3 |
| Transcripts | Direct YouTube caption fetch + yt-dlp fallback |
| Rich text | TipTap |

---

## Getting Started

**Prerequisites:** Node.js 18+, [yt-dlp](https://github.com/yt-dlp/yt-dlp), a [Neon](https://neon.tech) Postgres database, and a [Google OAuth client](https://console.cloud.google.com/).

```bash
git clone https://github.com/powerfool/yt_tutor.git
cd yt_tutor
npm install
```

Copy `.env.example` to `.env` and fill in:

```env
DATABASE_URL="postgresql://..."   # Neon connection string

# NextAuth — generate with: openssl rand -base64 32
AUTH_SECRET="your-random-secret"
AUTH_URL="http://localhost:3000"

# Google OAuth (console.cloud.google.com → Credentials → OAuth 2.0 Client ID)
# Dev redirect URI: http://localhost:3000/api/auth/callback/google
AUTH_GOOGLE_ID="....apps.googleusercontent.com"
AUTH_GOOGLE_SECRET="GOCSPX-..."

# Optional — can be added later via Settings in the UI
ANTHROPIC_API_KEY="sk-ant-..."
YOUTUBE_API_KEY="AIza..."
```

Then:

```bash
npx prisma migrate deploy
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with Google. API keys can be added any time from the Settings page in the UI.

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

## Security

- All API routes require a valid session — unauthenticated requests return 401
- API keys are server-side only, never sent to the browser
- All YouTube and Claude calls are proxied through Next.js API routes

---

## Known Limitations

- **Transcripts require captions** — videos without captions will show "unavailable" in the transcript tab
- **Transcript fetching is best-effort** — the primary path scrapes `ytInitialPlayerResponse` from YouTube's page HTML; if YouTube changes that format it may break. The yt-dlp fallback is more resilient but adds a few seconds of latency
- **No export integrations** — copy-paste is the only way to get content out of the notebook for now

---

## Wishlist / Backlog

Features and improvements to address in future iterations:

- **Browser extension** — injected sidebar on YouTube pages (works on Chrome and Firefox); auth handoff from Google OAuth; same chat + notebook UI in a narrow layout calling the hosted API
- **Encrypt API keys at rest** — application-level AES-256-GCM encryption for stored Anthropic/YouTube keys in the database, since users are trusting the app with keys that have billing implications
- **Rate limiting on AI endpoints** — per-user request limits on `/api/chat`, `/api/chat/suggest`, and `/api/chat/chapters` to protect the server-level fallback API key
- **Server-side chat history** — fetch conversation history from the DB in the chat route instead of trusting the client-supplied `history` array
- **Notebook export** — export to Markdown or PDF directly from the notebook toolbar
- **Video search within a project** — search across the watch history and transcripts of all videos in a project
- **Playlist / batch import** — paste a YouTube playlist URL to create a project pre-loaded with all videos
- **Next.js middleware auth guard** — single edge-level auth check covering all `/api/*` and `/project/*` routes, as a defence-in-depth complement to per-route checks
- **Validate `videoId` server-side** — enforce the 11-char YouTube ID format (`/^[a-zA-Z0-9_-]{11}$/`) before passing to fetch or yt-dlp
