import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicApiKey, getPrompt } from "@/lib/settings";
import { getVideoData } from "@/lib/transcript";

function formatMs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse(null, { status: 401 });
  const userId = session.user.id;

  const apiKey = await getAnthropicApiKey(userId);
  if (!apiKey) return new NextResponse(null, { status: 402 });
  const client = new Anthropic({ apiKey });
  const chaptersSystemPrompt = await getPrompt(userId, "chaptersSystemPrompt");
  const chaptersUserPrompt = await getPrompt(userId, "chaptersUserPrompt");

  const { videoId }: { videoId: string | null } = await req.json();

  if (!videoId) return NextResponse.json({ chapters: [] });

  const { transcript, videoTitle } = await getVideoData(videoId, userId);

  if (!transcript || transcript.length === 0) {
    return NextResponse.json({ chapters: [] });
  }

  // Sample the transcript — keep every segment but cap total characters
  const lines = transcript.map((s) => `[${formatMs(s.offset)}] ${s.text}`);
  let transcriptText = lines.join("\n");
  if (transcriptText.length > 12000) {
    // Sample to ~12k chars by taking every Nth segment
    const n = Math.ceil(lines.length / 300);
    transcriptText = lines.filter((_, i) => i % n === 0).join("\n");
  }

  const prompt =
    `Analyze this YouTube video transcript and identify the main topic chapters.\n` +
    `Video title: "${videoTitle ?? "Unknown"}"\n\n` +
    `TRANSCRIPT (format: [mm:ss] text):\n${transcriptText}\n\n` +
    chaptersUserPrompt;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: [
        {
          type: "text",
          text: chaptersSystemPrompt,
        },
      ],
      messages: [{ role: "user", content: prompt }],
    });

    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "[]";
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    const chapters = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    return NextResponse.json({ chapters });
  } catch (err) {
    console.error("[CHAPTERS] error:", err);
    return NextResponse.json({ chapters: [] });
  }
}
