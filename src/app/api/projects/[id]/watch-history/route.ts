import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return new NextResponse(null, { status: 401 });

  const { id: projectId } = await params;
  const { videoId, videoTitle } = await req.json();

  const entry = await prisma.watchHistory.create({
    data: { projectId, videoId, videoTitle },
  });

  return NextResponse.json(entry, { status: 201 });
}
