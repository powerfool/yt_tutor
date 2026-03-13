import { PrismaClient } from "@/generated/prisma/client";
import path from "path";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// Use absolute path so Prisma finds the DB regardless of Turbopack's cwd resolution
const url = `file:${path.resolve(process.cwd(), "prisma/dev.db")}`;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error"],
    datasources: { db: { url } },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
