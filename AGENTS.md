# AGENTS.md — YT Tutor

A personal YouTube player with an AI research sidebar and persistent per-project notebook. Read the full spec and plan in `opportunity assessment.md`.

---

## Getting Started

**For a new agent — read in this order:**
1. This file
2. `opportunity assessment.md` — full spec, data model, and phased implementation plan
3. `README.md` — current build status and how to run
4. `TESTING.md` — manual QA steps per feature

**Then:**
1. Run `npm run dev` and verify the app starts
2. Check README.md for current phase status
3. Continue with the next incomplete phase from the plan
4. Update docs as you go

---

## What This Is

A single-user web app. The user pastes a YouTube URL, watches it, asks the AI questions in a sidebar, and saves notes to a per-project notebook. Projects are like NotebookLM projects — each has its own chat history and notebook. The chat is a continuous log across all videos watched in a project; when a new video loads, a system message appears inline.

---

## Codebase Map

```
src/
  app/
    login/           — login page (unauthenticated)
    project/[id]/    — main project page (player + chat + notebook)
    api/
      auth/          — NextAuth handler
      projects/      — CRUD for projects
      projects/[id]/
        messages/    — project chat history
        notebook/    — project notebook content
        watch-history/ — videos watched in project
      chat/          — streaming Claude API route
  components/
    ProjectTabBar    — top tab bar
    VideoPanel       — YouTube IFrame + URL bar
    TranscriptPanel  — collapsible transcript below player
    ChatPanel        — AI chat with video-focus toggle
    NotebookPanel    — TipTap editor with autosave
    WatchHistory     — list of videos watched in project
  lib/
    youtube.ts       — YouTube Data API client (transcript + metadata)
    prisma.ts        — Prisma client singleton
  middleware.ts      — redirect unauthenticated users to /login
prisma/
  schema.prisma      — Project, WatchHistory, Message, Notebook models
  dev.db             — SQLite database (gitignored, outside web root)
ecosystem.config.js  — PM2 config for VPS
```

---

## Tech Stack

- **Next.js 14** (App Router, TypeScript, Tailwind CSS)
- **Prisma + SQLite** — single-user, no server DB needed
- **NextAuth.js** — credentials provider, single user from env vars
- **TipTap** — rich text notebook editor
- **YouTube IFrame Player API** — video playback
- **YouTube Data API v3** — transcript + metadata (key in env)
- **Anthropic Claude API** — streaming AI chat (key in env)
- **next-themes** — dark mode via `prefers-color-scheme`
- **PM2** — process management on VPS

---

## Environment Variables

All keys are server-side only. See `.env.example` for required vars:

```
NEXTAUTH_SECRET
NEXTAUTH_URL
ADMIN_USERNAME
ADMIN_PASSWORD_HASH      # bcrypt hash
ANTHROPIC_API_KEY
YOUTUBE_API_KEY
DATABASE_URL             # file:../prisma/dev.db (outside web root)
```

Never expose API keys to the client. All YouTube and Claude calls go through API routes.

---

## Development Workflow

```bash
npm run dev        # start dev server (localhost:3000)
npm run build      # production build
npm run lint       # ESLint
npm run test       # Jest
npx prisma migrate dev   # apply schema changes
npx prisma studio        # inspect DB
```

**On VPS:**
```bash
npm run build && pm2 restart yt-tutor
pm2 logs yt-tutor          # view logs
```

---

## Next.js App Router — Critical Patterns

- **Version:** Next.js 16.1.6 (Turbopack). Note: this version renamed `middleware.ts` → `src/proxy.ts`. Auth proxy lives at `src/proxy.ts`.
- **Server vs client components:** API routes in `src/app/api/` run server-side only — safe for secrets. Components using hooks (`useState`, `useEffect`) need `"use client"` at the top.
- **Streaming:** The `/api/chat` route uses `ReadableStream`. Test streaming in the browser; don't rely on unit tests alone.
- **NextAuth v5:** Uses `auth()` (not `getServerSession`). Session check in API routes: `const session = await auth(); if (!session) return new Response(null, { status: 401 });`
- **Prisma client singleton:** Import only from `src/lib/prisma.ts`. Never instantiate `new PrismaClient()` elsewhere — hot reload creates too many connections.
- **Dark mode:** Use `next-themes` with `attribute="class"` and `defaultTheme="system"`. Apply `dark:` Tailwind classes on components.

## Auth — Critical Patterns

- **bcrypt hash in .env:** Escape every `$` with `\$` — Next.js uses `dotenv-expand` which expands `$vars` even inside single quotes. Correct format: `ADMIN_PASSWORD_HASH=\$2b\$10\$...` (no quotes).

## Prisma 6 — Critical Patterns

- **Import path:** `import { PrismaClient } from "@/generated/prisma/client"` — NOT `@/generated/prisma` (no index.ts in v6).
- **Generated files:** `src/generated/prisma/` is gitignored. Run `npx prisma generate` after cloning or after schema changes.
- **Config file:** `prisma.config.ts` at root (not `prisma/schema.prisma` alone). DATABASE_URL is read via `dotenv/config` in that file.
- **Migration:** `npx prisma migrate dev --name <name>` — runs generate automatically after migration.
- **DB path resolution (CRITICAL):** Prisma CLI resolves `file:./dev.db` relative to `prisma/schema.prisma` (→ `prisma/dev.db`). Next.js/Turbopack resolves DATABASE_URL from an unpredictable cwd. Always construct the DB URL as an absolute path in `src/lib/prisma.ts` using `path.resolve(process.cwd(), "prisma/dev.db")` — do not rely on the env var path at runtime.

---

## Logging

Format: `[HH:MM:SS] [PREFIX] message`

Prefixes: `[API]`, `[CHAT]`, `[YT]`, `[DB]`, `[AUTH]`

Log at the start and end of every API route. Log errors with full stack traces.

---

## Collaboration Style

- Think step-by-step before writing code — explain your approach first
- Define new technical terms before using them
- When requirements are unclear: state your assumption explicitly, proceed, flag it in a comment
- Pause at natural checkpoints; don't barrel through phases without check-ins

---

## Version Control

- Never commit directly to `main` — use `feature/phase-N-name` branches
- Propose commit messages in a code block and wait for confirmation
- Never commit: `.env`, `dev.db`, `node_modules`, built artifacts
- Always commit: `.env.example`, `package.json`, `prisma/schema.prisma`
- Format: `feat: phase N — description` with bullet points of key changes

---

## Code Review

After completing any major phase, request a code review:

> "Please dispatch two subagents to carefully review [phase name]. Tell them they're competing with another agent. Make sure they look at both architecture and implementation. Tell them whomever finds more issues gets promoted."

If sub-agents unavailable, prompt the user with the manual review instructions from `from thinking to coding/3-create-agent-instructions/code-review.md`.

---

## Phase Wrap-Up Protocol

Before calling any phase complete, you MUST:

1. **Run and show output:**
   - `npm run lint` → show "0 errors"
   - `npm run test` → show "X/X pass"
   - `npm run build` → show "exit 0"

2. **Verify phase objectives line by line** from `opportunity assessment.md`

3. **Update docs:**
   - `README.md` — current status, what works, what's next
   - `TESTING.md` — QA steps for new features
   - `opportunity assessment.md` — if implementation differed from plan, update with decision + rationale

4. **Proactively say:** "Let's wrap up Phase N"

5. **Walk the user through testing:** "Go to X, do Y, you should see Z"

6. **Wait for confirmation** — NEVER proceed to next phase without it

7. **Memory sweep:** Ask "What would confuse a future agent about this?" — capture anything non-obvious in this file

8. **Offer to commit**

**Never say:**
- "Should work now"
- "Tests passed" (without showing output)
- "Phase complete, moving to Phase N"

---

## Continuous Documentation

Update docs as you work — not just at wrap-up.

- **AGENTS.md** — gotchas, patterns, framework surprises
- **opportunity assessment.md** — when implementation differs from plan
- **README.md** — after each phase, update current status

Ask yourself: *"What would confuse a future agent about this?"* If anything, write it down before moving on.
