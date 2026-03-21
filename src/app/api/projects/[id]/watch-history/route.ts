import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return new NextResponse(null, { status: 401 });

  const { id: projectId } = await params;
  const videoId = req.nextUrl.searchParams.get("videoId");

  if (videoId) {
    // Cache lookup for a specific video
    const entry = await prisma.watchHistory.findFirst({ where: { projectId, videoId } });
    return NextResponse.json(entry ?? null);
  }

  const entries = await prisma.watchHistory.findMany({
    where: { projectId },
    orderBy: { watchedAt: "desc" },
  });

  return NextResponse.json(entries);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return new NextResponse(null, { status: 401 });

  const { id: projectId } = await params;
  const { videoId, videoTitle } = await req.json();

  const existing = await prisma.watchHistory.findFirst({ where: { projectId, videoId } });

  let entry;
  if (existing) {
    entry = await prisma.watchHistory.update({
      where: { id: existing.id },
      data: { videoTitle, watchedAt: new Date() },
    });
  } else {
    entry = await prisma.watchHistory.create({
      data: { projectId, videoId, videoTitle },
    });
  }

  return NextResponse.json(entry, { status: 200 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return new NextResponse(null, { status: 401 });

  const { id: projectId } = await params;
  const { videoId, chapters, transcript } = await req.json();

  const existing = await prisma.watchHistory.findFirst({ where: { projectId, videoId } });
  if (!existing) return new NextResponse(null, { status: 404 });

  const data: Record<string, string> = {};
  if (chapters !== undefined) data.chaptersJson = JSON.stringify(chapters);
  if (transcript !== undefined) data.transcriptJson = JSON.stringify(transcript);

  const entry = await prisma.watchHistory.update({ where: { id: existing.id }, data });
  return NextResponse.json(entry);
}
