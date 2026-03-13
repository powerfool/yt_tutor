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

  try {
    const stream = await client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [...history, { role: "user", content: message }],
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (
              chunk.type === "content_block_delta" &&
              chunk.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(chunk.delta.text));
            }
          }
        } catch (err) {
          console.error("[CHAT] stream error:", err);
          controller.enqueue(encoder.encode("\n\n[Stream interrupted]"));
        }
        controller.close();
      },
    });

    return new NextResponse(readable, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err: unknown) {
    console.error("[CHAT] Anthropic API error:", err);

    // Map Anthropic SDK errors to readable messages
    const status = (err as { status?: number })?.status;
    let userMessage = "Something went wrong with the AI. Please try again.";
    let httpStatus = 500;

    if (status === 401) {
      userMessage = "Invalid API key. Check your ANTHROPIC_API_KEY.";
      httpStatus = 401;
    } else if (status === 403) {
      userMessage = "Access denied. Your API key may lack permissions.";
      httpStatus = 403;
    } else if (status === 429) {
      userMessage = "Rate limit or credit limit reached. Please check your Anthropic account balance.";
      httpStatus = 429;
    } else if (status === 529) {
      userMessage = "Anthropic API is overloaded. Please try again in a moment.";
      httpStatus = 503;
    }

    return NextResponse.json({ error: userMessage }, { status: httpStatus });
  }
}
