/**
 * One-shot migration: copies all projects/messages/notebooks/watch-history
 * from the old SQLite dev.db into the Neon Postgres DB, owned by a given email.
 *
 * Usage:
 *   npx tsx scripts/migrate-sqlite.ts dimitzortzis@gmail.com
 */
import Database from "better-sqlite3";
import path from "path";
import { PrismaClient } from "../src/generated/prisma/client";

const email = process.argv[2];
if (!email) {
  console.error("Usage: npx tsx scripts/migrate-sqlite.ts <email>");
  process.exit(1);
}

const prisma = new PrismaClient({ log: ["error"] });
const sqlite = new Database(path.resolve("prisma/dev.db"), { readonly: true });

async function main() {
  // 1. Find or create the target user
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({ data: { email, name: email } });
    console.log(`Created user ${email} (${user.id})`);
  } else {
    console.log(`Found user ${email} (${user.id})`);
  }

  const projects = sqlite
    .prepare("SELECT id, name, createdAt FROM Project")
    .all() as { id: string; name: string; createdAt: number }[];

  console.log(`Migrating ${projects.length} projects…`);

  for (const p of projects) {
    // Check if already migrated (idempotent)
    const existing = await prisma.project.findUnique({ where: { id: p.id } });
    if (existing) {
      console.log(`  skip ${p.name} (already exists)`);
      continue;
    }

    const messages = sqlite
      .prepare("SELECT id, role, content, createdAt FROM Message WHERE projectId = ?")
      .all(p.id) as { id: string; role: string; content: string; createdAt: number }[];

    const notebook = sqlite
      .prepare("SELECT id, content FROM Notebook WHERE projectId = ?")
      .get(p.id) as { id: string; content: string } | undefined;

    const history = sqlite
      .prepare("SELECT id, videoId, videoTitle, watchedAt, chaptersJson, transcriptJson FROM WatchHistory WHERE projectId = ?")
      .all(p.id) as {
        id: string;
        videoId: string;
        videoTitle: string;
        watchedAt: string;
        chaptersJson: string | null;
        transcriptJson: string | null;
      }[];

    await prisma.$transaction(async (tx) => {
      await tx.project.create({
        data: {
          id: p.id,
          name: p.name,
          userId: user!.id,
          createdAt: new Date(p.createdAt),
        },
      });

      if (messages.length > 0) {
        await tx.message.createMany({
          data: messages.map((m) => ({
            id: m.id,
            projectId: p.id,
            role: m.role,
            content: m.content,
            createdAt: new Date(m.createdAt),
          })),
        });
      }

      if (notebook) {
        await tx.notebook.create({
          data: {
            id: notebook.id,
            projectId: p.id,
            content: notebook.content ?? "",
          },
        });
      }

      if (history.length > 0) {
        await tx.watchHistory.createMany({
          data: history.map((h) => ({
            id: h.id,
            projectId: p.id,
            videoId: h.videoId,
            videoTitle: h.videoTitle,
            watchedAt: new Date(h.watchedAt),
            chaptersJson: h.chaptersJson ?? null,
            transcriptJson: h.transcriptJson ?? null,
          })),
        });
      }

      console.log(
        `  ✓ ${p.name} — ${messages.length} messages, ${history.length} watch history, notebook: ${!!notebook}`
      );
    });
  }

  console.log("Done.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => { prisma.$disconnect(); sqlite.close(); });
