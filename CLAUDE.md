# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server
npm run build      # Production build
npm run start      # Start production server
npm run lint       # Run ESLint

npx prisma generate          # Regenerate Prisma client (after schema changes)
npx prisma migrate dev       # Run migrations in dev
npx prisma migrate deploy    # Apply migrations in production
```

Production is managed with PM2 via `ecosystem.config.js` (runs `next start` on port 3000).

## Architecture

Next.js App Router app. Three-column layout: Video+Transcript | Chat | Notebook, organized into **Projects** (one per learning topic).

### Key directories
- `src/app/` — Pages and API routes
- `src/components/` — All UI components (client-side)
- `src/lib/` — Shared utilities (prisma client, settings cache, transcript cache, markdown→tiptap converter)
- `src/generated/prisma/` — Generated Prisma client (do not edit)
- `prisma/` — Schema and migrations

### Database
PostgreSQL via Neon serverless. Prisma client uses `@prisma/adapter-neon` (HTTP driver, not TCP) to avoid stale connection errors in serverless/edge environments. Singleton pattern in `src/lib/prisma.ts`.

### Auth
NextAuth v5 (`src/auth.ts`) with Google OAuth only. Database session strategy (sessions stored in Postgres, not JWT). On first login, a "My First Project" is auto-created via the `createUser` event. All API routes guard with:
```typescript
const session = await auth();
if (!session?.user?.id) return new NextResponse(null, { status: 401 });
```
Project ownership is always validated before access/mutation.

### AI Chat (`src/app/api/chat/route.ts`)
Streams responses from `claude-sonnet-4-6`. Uses Anthropic prompt caching: the full transcript is sent as an ephemeral-cached block; current playback position is a separate uncached block. Supports a `videoOnly` mode that restricts Claude to video content.

### BYOK (Bring Your Own Key)
Users can provide their own Anthropic and YouTube API keys in Settings. `src/lib/settings.ts` has per-user in-memory cache with invalidation. `getAnthropicApiKey(userId)` and `getYoutubeApiKey(userId)` fall back to server env vars if user hasn't set their own.

### Transcript fetching
`src/app/api/youtube/[videoId]/route.ts` — Primary: scrapes `ytInitialPlayerResponse` from YouTube page HTML. Fallback: `yt-dlp` subprocess. Results are cached in-memory for 1 hour (`src/lib/transcriptCache.ts`) so subsequent chat requests skip the YouTube round-trip.

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Neon Postgres connection string |
| `AUTH_SECRET` | Yes | NextAuth secret (`openssl rand -base64 32`) |
| `AUTH_URL` | Yes | Public app URL (e.g. `https://yourdomain.com`) |
| `AUTH_GOOGLE_ID` | Yes | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | Yes | Google OAuth client secret |
| `ANTHROPIC_API_KEY` | No | Server-level fallback if user has no key |
| `YOUTUBE_API_KEY` | No | Server-level fallback if user has no key |
