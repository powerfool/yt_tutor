import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { invalidateSettingsCache, PROMPT_DEFAULTS } from "@/lib/settings";

const ALLOWED_KEYS = [
  "anthropicApiKey",
  "youtubeApiKey",
  ...Object.keys(PROMPT_DEFAULTS),
];

function maskKeys(row: Record<string, unknown>) {
  return {
    ...row,
    anthropicApiKey: row.anthropicApiKey ? "set" : null,
    youtubeApiKey: row.youtubeApiKey ? "set" : null,
  };
}

export async function GET() {
  const session = await auth();
  if (!session) return new NextResponse(null, { status: 401 });
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
  });
  return NextResponse.json({
    ...maskKeys((settings ?? {}) as Record<string, unknown>),
    hasServerFallback: !!process.env.ANTHROPIC_API_KEY,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return new NextResponse(null, { status: 401 });
  const body = await req.json();
  const data: Record<string, string | null> = {};
  for (const key of ALLOWED_KEYS) {
    if (key in body) data[key] = body[key] === "" ? null : String(body[key]);
  }
  const settings = await prisma.settings.upsert({
    where: { id: "singleton" },
    update: data,
    create: { id: "singleton", ...data },
  });
  invalidateSettingsCache();
  return NextResponse.json(maskKeys(settings as unknown as Record<string, unknown>));
}
