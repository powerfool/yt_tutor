import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return new NextResponse(null, { status: 401 });

  const { id: projectId } = await params;

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

  // Upsert: update existing entry if video was watched before, otherwise create
  const existing = await prisma.watchHistory.findFirst({
    where: { projectId, videoId },
  });

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
  const { videoId, chapters } = await req.json();

  const existing = await prisma.watchHistory.findFirst({
    where: { projectId, videoId },
  });

  if (!existing) {
    return new NextResponse(null, { status: 404 });
  }

  const entry = await prisma.watchHistory.update({
    where: { id: existing.id },
    data: { chaptersJson: JSON.stringify(chapters) },
  });

  return NextResponse.json(entry);
}
