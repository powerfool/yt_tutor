# YT Tutor

**YT Tutor** turns passive YouTube watching into active learning. Paste a URL, and alongside the video you get an AI research partner and a personal notebook — all in one window, all saved automatically.

Built for solo use — self-hosted, single user, runs on a VPS. API keys and AI prompts are configurable from the UI — no code changes needed after first deploy.

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

---

### Build a notebook

Everything worth keeping goes in the notebook — a rich text editor on the right. Hover any AI response to copy it straight to the notebook with full formatting intact (bullet points, bold text, code blocks — all preserved). Or select any text in chat and copy just that snippet.

The notebook autosaves as you type. One notebook per project, always waiting where you left it.

---

### Organize with projects

Projects work like browser tabs for your research. Each one has its own video history, chat log, and notebook. Switch between them instantly from the tab bar. Rename them by double-clicking. Nothing bleeds between projects.

---

### Settings

A gear icon in the tab bar opens the settings page. Add your Anthropic and YouTube API keys directly in the UI — no config file edits needed after the first deploy. You can also override any of the AI prompts if you want to tune how Claude behaves.

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
| Database | SQLite via Prisma |
| Auth | NextAuth v5 (credentials, single user) |
| AI | Anthropic Claude API (streaming, prompt caching) |
| Video | YouTube IFrame Player API + Data API v3 |
| Transcripts | Direct YouTube caption fetch + yt-dlp fallback |
| Rich text | TipTap |

---

## Getting Started

**Prerequisites:** Node.js 18+, [yt-dlp](https://github.com/yt-dlp/yt-dlp), an [Anthropic API key](https://console.anthropic.com/), and a [YouTube Data API v3 key](https://console.cloud.google.com/).

```bash
git clone https://github.com/powerfool/yt_tutor.git
cd yt_tutor
npm install
npx prisma generate
```

Copy `.env.example` to `.env` and fill in:

```env
DATABASE_URL="file:./prisma/dev.db"

# NextAuth — generate with: openssl rand -base64 32
AUTH_SECRET="your-random-secret"
AUTH_URL="http://localhost:3000"

ADMIN_USERNAME="your-username"

# Generate: node -e "const b = require('bcryptjs'); b.hash('your-password', 10).then(console.log)"
# Escape every $ as \$ in this file
ADMIN_PASSWORD_HASH=\$2b\$10\$...

ANTHROPIC_API_KEY="sk-ant-..."
YOUTUBE_API_KEY="AIza..."
```

> **Note:** Every `$` in the bcrypt hash must be escaped as `\$` — Next.js will silently corrupt it otherwise.

Then:

```bash
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in. API keys can also be updated any time from the Settings page in the UI.

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

- **Single user only** — no multi-user or role support
- **Transcripts require captions** — videos without captions will show "unavailable" in the transcript tab
- **Transcript fetching is best-effort** — the primary path scrapes `ytInitialPlayerResponse` from YouTube's page HTML; if YouTube changes that format it may break. The yt-dlp fallback is more resilient but adds a few seconds of latency
- **No export integrations** — copy-paste is the only way to get content out of the notebook for now
