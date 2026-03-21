import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session) return new NextResponse(null, { status: 401 });

  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(projects);
}

export async function POST() {
  const session = await auth();
  if (!session) return new NextResponse(null, { status: 401 });

  const project = await prisma.project.create({
    data: { name: "New Project" },
  });

  return NextResponse.json(project, { status: 201 });
}
