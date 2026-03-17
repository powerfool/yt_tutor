import { auth } from "@/auth";
import { fetchVideoInfo, fetchTranscript } from "@/lib/youtube.server";
import { populateCache } from "@/lib/transcript";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse(null, { status: 401 });
  const userId = session.user.id;

  const { videoId } = await params;
  const [{ title, ytChapters }, transcript] = await Promise.all([
    fetchVideoInfo(videoId, userId),
    fetchTranscript(videoId),
  ]);

  // Pre-populate cache so subsequent chat requests skip the YouTube round-trip
  populateCache(videoId, title, transcript);

  return NextResponse.json({ title, transcript, ytChapters });
}
