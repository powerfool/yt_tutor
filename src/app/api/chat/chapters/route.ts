import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { TranscriptSegment } from "@/lib/youtube";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function formatMs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return new NextResponse(null, { status: 401 });

  const {
    transcript,
    videoTitle,
  }: { transcript: TranscriptSegment[] | null; videoTitle: string | null } =
    await req.json();

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
    `Return ONLY a JSON array of chapters. Each chapter needs a short title (3–6 words) ` +
    `and the startTimeSec (integer seconds) where that topic begins.\n` +
    `Rules:\n` +
    `- Identify 4–8 chapters depending on video length\n` +
    `- First chapter MUST start at 0\n` +
    `- startTimeSec values must be plausible given the timestamps in the transcript\n` +
    `- Return valid JSON only, no markdown fences, no explanation\n` +
    `Example: [{"title":"Introduction","startTimeSec":0},{"title":"Core Concepts","startTimeSec":120}]`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: [
        {
          type: "text",
          text: "You are a precise JSON-only assistant. Never output anything outside a JSON array.",
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
