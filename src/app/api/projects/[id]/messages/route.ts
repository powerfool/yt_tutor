import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

async function ownedProject(projectId: string, userId: string) {
  return prisma.project.findUnique({ where: { id: projectId, userId } });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse(null, { status: 401 });

  const { id: projectId } = await params;
  if (!await ownedProject(projectId, session.user.id)) {
    return new NextResponse(null, { status: 404 });
  }

  const messages = await prisma.message.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(messages);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse(null, { status: 401 });

  const { id: projectId } = await params;
  if (!await ownedProject(projectId, session.user.id)) {
    return new NextResponse(null, { status: 404 });
  }

  const { role, content, videoId } = await req.json();

  const message = await prisma.message.create({
    data: { projectId, role, content, videoId: videoId ?? null },
  });

  return NextResponse.json(message, { status: 201 });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse(null, { status: 401 });

  const { id: projectId } = await params;
  if (!await ownedProject(projectId, session.user.id)) {
    return new NextResponse(null, { status: 404 });
  }

  await prisma.message.deleteMany({ where: { projectId } });

  return new NextResponse(null, { status: 204 });
}
