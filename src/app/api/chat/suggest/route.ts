import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { TranscriptSegment } from "@/lib/youtube";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type HistoryMessage = { role: "user" | "assistant"; content: string };

function formatMs(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatSec(sec: number): string {
  const mins = Math.floor(sec / 60);
  const secs = Math.floor(sec % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return new NextResponse(null, { status: 401 });

  const {
    transcript,
    videoTitle,
    currentTimeSec,
    history,
  }: {
    transcript: TranscriptSegment[] | null;
    videoTitle: string | null;
    currentTimeSec: number;
    history: HistoryMessage[];
  } = await req.json();

  // Block 1: static transcript (cached)
  let block1: string;
  if (transcript && transcript.length > 0) {
    const transcriptText = transcript
      .map((s) => `${formatMs(s.offset)} ${s.text}`)
      .join("\n");
    block1 =
      `You are a helpful research assistant helping a learner study a YouTube video.\n` +
      `The video is titled: "${videoTitle ?? "Unknown"}"\n\n` +
      `FULL TRANSCRIPT:\n${transcriptText}`;
  } else if (videoTitle) {
    block1 =
      `You are a helpful research assistant helping a learner study a YouTube video.\n` +
      `The video is titled: "${videoTitle}"\n` +
      `(No transcript available for this video.)`;
  } else {
    block1 = `You are a helpful research assistant helping a learner study a YouTube video.`;
  }

  const timeStr = formatSec(currentTimeSec ?? 0);
  const block2 = `The learner is currently at ${timeStr}.`;

  const historyContext =
    history.length > 0
      ? `\n\nConversation so far:\n${history.map((m) => `${m.role === "user" ? "Learner" : "Assistant"}: ${m.content}`).join("\n")}`
      : "";

  const userPrompt =
    `Given what the learner has watched so far (up to ${timeStr})${historyContext ? " and their conversation history" : ""}, ` +
    `generate exactly 4 concise suggested questions they might want to ask next about the video content.\n` +
    `Return ONLY a JSON array of 4 strings, no explanation, no markdown fences.\n` +
    `Example: ["What does X mean?", "How does Y work?", "Can you explain Z?", "What is the significance of W?"]` +
    historyContext;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const systemBlocks: any[] = [
      { type: "text", text: block1, cache_control: { type: "ephemeral" } },
      { type: "text", text: block2 },
    ];

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      system: systemBlocks,
      messages: [{ role: "user", content: userPrompt }],
    });

    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "[]";

    // Extract JSON array from response (strip any accidental markdown)
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    const suggestions: string[] = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    // Ensure exactly 4 items
    const trimmed = suggestions.slice(0, 4);
    while (trimmed.length < 4) trimmed.push("Tell me more about this video.");

    return NextResponse.json({ suggestions: trimmed });
  } catch (err) {
    console.error("[SUGGEST] error:", err);
    return NextResponse.json(
      { suggestions: ["What is this video about?", "Summarize the key points.", "What are the main takeaways?", "Explain the core concepts."] },
      { status: 200 }
    );
  }
}
