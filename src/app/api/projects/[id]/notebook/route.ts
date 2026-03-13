import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return new NextResponse(null, { status: 401 });

  const { id } = await params;

  const notebook = await prisma.notebook.upsert({
    where: { projectId: id },
    create: { projectId: id, content: "" },
    update: {},
  });

  return NextResponse.json(notebook);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return new NextResponse(null, { status: 401 });

  const { id } = await params;
  const { content } = await req.json();

  const notebook = await prisma.notebook.upsert({
    where: { projectId: id },
    create: { projectId: id, content },
    update: { content },
  });

  return NextResponse.json(notebook);
}
