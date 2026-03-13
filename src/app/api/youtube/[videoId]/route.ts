import { auth } from "@/auth";
import { fetchVideoInfo, fetchTranscript } from "@/lib/youtube.server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const session = await auth();
  if (!session) return new NextResponse(null, { status: 401 });

  const { videoId } = await params;
  const [{ title, ytChapters }, transcript] = await Promise.all([
    fetchVideoInfo(videoId),
    fetchTranscript(videoId),
  ]);

  return NextResponse.json({ title, transcript, ytChapters });
}
