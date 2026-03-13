# Objective

Build a web app that replaces how I watch YouTube — a personal video player with an AI research partner and a persistent notebook, always on.

# Target customer

Just me, for now. Accessed online with lightweight auth so it's secure.

# Success

I can paste a YouTube URL, watch it, ask the AI anything mid-video, and save the gold to a notebook — without breaking my flow. Over time, the notebook becomes a real artifact of my learning across multiple topics and sessions.

# What I believe

- The trigger is curiosity: something catches my ear and I want to chase it *right then*, not lose it
- The notebook is the artifact — it outlives any single video and accumulates across a whole learning journey
- This should eventually be my main YouTube player, not a tool I reach for occasionally
- Projects/tabs let topics stay separate organically, the way NotebookLM does it

# What I need to research

- YouTube Data API (already have a key) — transcript retrieval, video metadata
- Good rich-text notebook component (Hackpad-style: collaborative feel, pleasant to type in)
- Auth options that are lightweight for a solo-user app

# Solution directions

**Layout (left → right):** YouTube player | AI chat | Notebook

- Top of the screen: URL bar — paste a YouTube link to load a video, like a browser address bar
- Dark mode following system setting

**Projects/tabs:**
- Multiple named projects open at once, like browser tabs or NotebookLM projects
- Each project has its own notebook and session history
- Switching projects is instant; everything persists

**AI chat:**
- Default mode: full Claude (general knowledge), no video context constraints
- Optional toggle: "focus on this video" — restricts answers to video transcript context
- Transcripts pulled automatically via YouTube Data API

**Transcript panel:**
- Toggle to open a panel under the video
- Shows transcript synced to current timestamp
- Selectable/copyable text — for grabbing verbatim quotes

**Notebook:**
- Hackpad-style rich text editor that supports markdown
- Lives to the right of the AI chat
- Highlight text in AI chat → one-click copy to notebook
- Freeform typing directly in the notebook
- Autosaves all edits
- Future: export integrations (Notion, markdown, etc.)

**Sessions:**
- No explicit session naming — organic, forms around what you watch but I should be able to add a name if desired.
- Everything persists when you come back

**Auth:** Simple auth so it's securely accessible online, single user for now.

# Detailed Spec

## Tech Stack

- **Framework:** Next.js (React + TypeScript + Tailwind + API routes)
- **Database:** SQLite via Prisma ORM
- **Rich text:** TipTap (Hackpad-style, markdown-aware)
- **AI:** Anthropic Claude API (streaming)
- **Video:** YouTube IFrame Player API (playback) + YouTube Data API v3 (transcripts, metadata)
- **Auth:** NextAuth.js with credentials provider (username + password, single user)
- **Hosting:** VPS on Hostinger, Node.js process via PM2

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Top bar: Project tabs + YouTube URL input                   │
├──────────────────┬───────────────────┬───────────────────────┤
│  Video panel     │  AI Chat          │  Notebook (TipTap)    │
│  (IFrame Player) │  (streaming)      │  (autosave)           │
│                  │                   │                       │
│  [Transcript     │  [highlight →     │                       │
│   panel toggle]  │   copy to NB]     │                       │
├──────────────────┴───────────────────┴───────────────────────┤
│  Transcript panel (collapsible, timestamp-synced)            │
└──────────────────────────────────────────────────────────────┘
         │                      │                   │
   YouTube APIs          Next.js API routes       SQLite
   (IFrame + Data)       (same server)            (Prisma)
                                │
                          Claude API
```

## Data Model

**Project** — id, name (optional), created_at, updated_at
**WatchHistory** — id, project_id, video_id, video_title, watched_at
**Message** — id, project_id, role (user|assistant|system), content, video_id (loaded at send time), created_at
**Notebook** — id, project_id, content (TipTap JSON), updated_at

One notebook per project. Chat is a continuous log across the whole project — not scoped to a video. When a new video loads, a system message is inserted inline: "Started watching: <<Video title>>". This gives the chat thread a timeline feel as you scroll back.

## Key User Flows

**Load a video:** Paste URL → parse video ID → load IFrame Player → fetch transcript + metadata via YouTube Data API → store transcript in memory → create WatchHistory record → insert system message "Started watching: <<Video title>>" into project chat.

**AI chat:** User sends message → POST /api/chat → if "video focus" toggle is on, prepend transcript to system prompt; otherwise plain Claude → stream response → render in chat.

**Copy to notebook:** Highlight text in chat → "Copy to notebook" button appears → click → appends to TipTap editor → debounced autosave → PATCH /api/notebook.

**Transcript panel:** Toggle button under video → panel slides open → transcript displayed with timestamps → current position highlighted → text is selectable/copyable.

**Projects:** Tab bar at top → create/switch/rename projects → each project loads its own notebook and session history instantly.

## Scope

**In scope:**
- Three-panel layout (video | chat | notebook)
- YouTube URL bar at top
- Project tabs (create, switch, rename)
- AI chat with streaming, full Claude default, video-focus toggle
- Transcript panel (collapsible, timestamp-synced, copyable)
- Highlight-to-notebook from chat
- TipTap notebook with autosave
- Session and notebook persistence per project
- Dark mode via system setting (`prefers-color-scheme`)
- Auth via NextAuth credentials

**Parking lot (out of scope now):**
- AI-suggested questions on pause
- Export integrations (Notion, markdown, etc.)
- Mobile layout
- Multiple users
- Video search (URL paste only)

## Security

- All API routes protected by NextAuth session check
- YouTube API key and Claude API key in server-side env vars only, never exposed to client
- CSRF protection via NextAuth built-ins
- Notebook autosave goes to authenticated API route only
- SQLite file outside the web root

---

# Risks to validate + how to validate them cheaply/quickly

- **Transcript availability via YouTube Data API:** Test coverage on typical videos early; define fallback UX when transcript is unavailable
- **Notebook as habit:** Value compounds only if it's actually used — highlight-to-notebook must be one click, autosave must be invisible

---

# Implementation Plan

## Tasks

### Phase 0: Setup & Auth
☐ Initialize Next.js 14 project with TypeScript and Tailwind CSS
☐ Set up Prisma with SQLite; define schema (Project, WatchHistory, Message, Notebook)
☐ Set up NextAuth.js credentials provider (single user from env vars)
☐ Build login page at `/login`; protect all routes behind session
☐ Add PM2 ecosystem config for VPS
☐ Add `.env.example` with all required keys

### Phase 1: Projects
☐ API routes: GET/POST `/api/projects`, PATCH `/api/projects/[id]`
☐ Project tab bar: list, create, rename (double-click), active highlight
☐ Project shell page at `/project/[id]` with three-panel layout (empty panels)

### Phase 2: YouTube Player
☐ URL bar component at top; parse video ID from pasted URL
☐ YouTube IFrame Player API integration
☐ On load: fetch title + transcript via YouTube Data API v3; store in React state
☐ POST `/api/projects/[id]/watch-history` on video load

### Phase 3: AI Chat
☐ API routes: GET/POST `/api/projects/[id]/messages`
☐ POST `/api/chat`: streaming Claude response; "video focus" toggle prepends transcript as system context
☐ Chat UI: scrollable history, input, send button, streaming render
☐ "Video focus" toggle in chat header

### Phase 4: Notebook
☐ API routes: GET/PATCH `/api/projects/[id]/notebook`
☐ TipTap editor in right panel with markdown support
☐ Debounced autosave (500ms) with subtle "Saved" status indicator

### Phase 5: Transcript Panel + Highlight-to-Notebook
☐ Collapsible transcript panel below player; timestamped segments
☐ Current segment highlight via IFrame Player API `getCurrentTime` polling
☐ Highlight text in chat → "Copy to notebook" button → append to TipTap → trigger autosave

### Phase 6: Watch History + System Messages + Dark Mode
☐ On video load: insert system message "Started watching: <<title>>" into project chat
☐ Watch history list within project (videos watched with timestamps)
☐ Dark mode via `next-themes`, driven by `prefers-color-scheme`

---

## Phase 0: Setup & Auth

**Affected files:**
- `package.json` (new) — Next.js, Tailwind, Prisma, NextAuth, TipTap dependencies
- `prisma/schema.prisma` (new) — Project, WatchHistory, Message, Notebook models
- `src/app/login/page.tsx` (new) — login form
- `src/app/api/auth/[...nextauth]/route.ts` (new) — NextAuth credentials config
- `src/middleware.ts` (new) — redirect unauthenticated requests to /login
- `ecosystem.config.js` (new) — PM2 config
- `.env.example` (new) — NEXTAUTH_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD_HASH, ANTHROPIC_API_KEY, YOUTUBE_API_KEY, DATABASE_URL

**Goal:** Secure foundation — nothing works without logging in.

**Done means:** App starts, unauthenticated users land on /login, credentials from .env grant access, logout works.

**Test it:**
1. Navigate to `/` — redirects to `/login`
2. Enter wrong credentials — error message shown
3. Enter correct credentials — lands on authenticated home
4. Click logout — back to `/login`, `/` redirects again

---

## Phase 1: Projects

**Affected files:**
- `prisma/schema.prisma` — confirm Project model
- `src/app/api/projects/route.ts` (new) — GET, POST
- `src/app/api/projects/[id]/route.ts` (new) — PATCH (rename)
- `src/components/ProjectTabBar.tsx` (new) — tab bar with create + rename
- `src/app/project/[id]/page.tsx` (new) — project shell, three-panel layout (empty)

**Goal:** Projects exist and are navigable.

**Done means:** Multiple projects created, tab switching instant, rename persists on refresh.

**Test it:**
1. Create two projects — tabs appear for both
2. Double-click a tab — rename it, refresh — new name persists
3. Click each tab — URL changes to `/project/[id]`, panels are empty but layout is correct

---

## Phase 2: YouTube Player

**Affected files:**
- `src/components/VideoPanel.tsx` (new) — URL bar + IFrame Player
- `src/lib/youtube.ts` (new) — YouTube Data API client (transcript fetch, metadata fetch)
- `src/app/api/projects/[id]/watch-history/route.ts` (new) — POST
- `src/app/project/[id]/page.tsx` — wire VideoPanel into left panel

**Goal:** Watch YouTube inside the app.

**Done means:** Paste URL → video plays; transcript fetched; WatchHistory record created.

**Test it:**
1. Paste a YouTube URL — video loads and plays
2. Paste a second URL — second video loads
3. Check DB — two WatchHistory records for the project
4. Paste a URL for a video without captions — graceful fallback message shown (no crash)

---

## Phase 3: AI Chat

**Affected files:**
- `src/app/api/projects/[id]/messages/route.ts` (new) — GET, POST
- `src/app/api/chat/route.ts` (new) — streaming Claude response, video-focus logic
- `src/components/ChatPanel.tsx` (new) — message list, input, streaming render, video-focus toggle
- `src/app/project/[id]/page.tsx` — wire ChatPanel into center panel; pass current video state

**Goal:** Ask Claude questions, get streaming answers, history persists.

**Done means:** Chat works with and without video focus; messages survive refresh.

**Test it:**
1. Send a general question (video focus off) — Claude answers broadly
2. Load a video, turn on video focus, ask about it — Claude references video content
3. Refresh page — chat history intact
4. Switch projects — each has its own independent chat history

---

## Phase 4: Notebook

**Affected files:**
- `src/app/api/projects/[id]/notebook/route.ts` (new) — GET, PATCH
- `src/components/NotebookPanel.tsx` (new) — TipTap editor, autosave, "Saved" indicator
- `src/app/project/[id]/page.tsx` — wire NotebookPanel into right panel

**Goal:** A persistent notebook per project, always autosaving.

**Done means:** Type → autosaves → persists on refresh; each project has its own notebook.

**Test it:**
1. Type in the notebook — "Saved" indicator appears within 1 second
2. Refresh — content is still there
3. Switch to another project — blank notebook (or its own content)
4. Switch back — original content intact

---

## Phase 5: Transcript Panel + Highlight-to-Notebook

**Affected files:**
- `src/components/TranscriptPanel.tsx` (new) — collapsible, timestamped segments, current-segment highlight
- `src/components/ChatPanel.tsx` — add text-selection handler + "Copy to notebook" button
- `src/components/NotebookPanel.tsx` — expose append method via ref or context

**Goal:** Transcript is readable and copyable; chat text flows into the notebook in one click.

**Done means:** Transcript syncs to playback position; copying from chat or transcript into notebook is one click.

**Test it:**
1. Load a video, open transcript panel — timestamped text visible
2. Seek to a different point — correct segment highlights
3. Select transcript text — copy it manually (browser copy)
4. Highlight text in a chat message — "Copy to notebook" button appears
5. Click it — text appended to notebook, autosave fires

---

## Phase 6: Watch History + System Messages + Dark Mode

**Affected files:**
- `src/app/api/projects/[id]/watch-history/route.ts` — add GET
- `src/components/WatchHistory.tsx` (new) — list of videos watched in project with timestamps
- `src/components/ChatPanel.tsx` — render system messages distinctly
- `src/app/project/[id]/page.tsx` — trigger system message insert on video load
- `src/app/api/projects/[id]/messages/route.ts` — support role: "system"
- `tailwind.config.ts` — enable `darkMode: 'media'`; apply `dark:` classes throughout

**Goal:** The chat thread tells the story of the project; app respects system dark mode.

**Done means:** Loading a video inserts a visible system message; watch history lists viewed videos; dark mode matches OS.

**Test it:**
1. Load two videos in a project — two "Started watching: …" messages appear in chat between Q&As
2. View watch history — both videos listed with timestamps
3. Switch OS to dark mode — app switches immediately
4. Switch back to light — app follows
