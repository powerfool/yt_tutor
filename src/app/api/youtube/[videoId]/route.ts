import { auth } from "@/auth";
import { fetchVideoTitle, fetchTranscript } from "@/lib/youtube.server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const session = await auth();
  if (!session) return new NextResponse(null, { status: 401 });

  const { videoId } = await params;
  const [title, transcript] = await Promise.all([
    fetchVideoTitle(videoId),
    fetchTranscript(videoId),
  ]);

  return NextResponse.json({ title, transcript });
}
