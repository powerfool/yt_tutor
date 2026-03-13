import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { TranscriptSegment } from "@/lib/youtube";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type HistoryMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return new NextResponse(null, { status: 401 });

  const {
    message,
    history,
    videoFocus,
    transcript,
    videoTitle,
  }: {
    message: string;
    history: HistoryMessage[];
    videoFocus: boolean;
    transcript: TranscriptSegment[] | null;
    videoTitle: string | null;
  } = await req.json();

  let systemPrompt = "You are a helpful research assistant.";

  if (videoFocus && transcript && transcript.length > 0) {
    const transcriptText = transcript
      .map((s) => s.text)
      .join(" ")
      .slice(0, 40000); // keep within context limits

    systemPrompt =
      `You are a helpful research assistant. The user is watching a YouTube video titled "${videoTitle}". ` +
      `Answer questions based on the video transcript below. You may also draw on general knowledge when helpful.\n\n` +
      `TRANSCRIPT:\n${transcriptText}`;
  } else if (videoFocus && videoTitle) {
    systemPrompt =
      `You are a helpful research assistant. The user is watching "${videoTitle}" but no transcript is available. ` +
      `Answer based on your general knowledge about this topic.`;
  }

  const stream = await client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      ...history,
      { role: "user", content: message },
    ],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (
          chunk.type === "content_block_delta" &&
          chunk.delta.type === "text_delta"
        ) {
          controller.enqueue(encoder.encode(chunk.delta.text));
        }
      }
      controller.close();
    },
  });

  return new NextResponse(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
