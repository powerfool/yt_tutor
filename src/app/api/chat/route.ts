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
    message,
    history,
    videoOnly,
    transcript,
    videoTitle,
    currentTimeSec,
  }: {
    message: string;
    history: HistoryMessage[];
    videoOnly: boolean;
    transcript: TranscriptSegment[] | null;
    videoTitle: string | null;
    currentTimeSec: number;
  } = await req.json();

  // Block 1: large static block (cached)
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

  // Block 2: small dynamic block (uncached)
  const timeStr = formatSec(currentTimeSec ?? 0);
  const focusInstruction = videoOnly
    ? "Answer strictly based on what has been said in the video. Do not bring in outside knowledge or your own views."
    : "Use both the video content and your general knowledge to give the most helpful answer.";
  const block2 = `The learner is currently at ${timeStr}. Treat content after this timestamp as unseen by them.\n${focusInstruction}`;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const systemBlocks: any[] = [
      { type: "text", text: block1, cache_control: { type: "ephemeral" } },
      { type: "text", text: block2 },
    ];

    const stream = await client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemBlocks,
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

    const status = (err as { status?: number })?.status;
    let userMessage = "Something went wrong with the AI. Please try again.";
    let httpStatus = 500;

    const rawMessage =
      (err as { error?: { error?: { message?: string } } })?.error?.error
        ?.message ?? "";

    if (status === 400 && rawMessage.toLowerCase().includes("credit")) {
      userMessage =
        "Credit balance too low. Please top up your Anthropic account at console.anthropic.com → Plans & Billing.";
      httpStatus = 402;
    } else if (status === 401) {
      userMessage = "Invalid API key. Check your ANTHROPIC_API_KEY.";
      httpStatus = 401;
    } else if (status === 403) {
      userMessage = "Access denied. Your API key may lack permissions.";
      httpStatus = 403;
    } else if (status === 429) {
      userMessage = "Rate limited. Please wait a moment and try again.";
      httpStatus = 429;
    } else if (status === 529) {
      userMessage =
        "Anthropic API is overloaded. Please try again in a moment.";
      httpStatus = 503;
    } else if (rawMessage) {
      userMessage = `API error: ${rawMessage}`;
    }

    return NextResponse.json({ error: userMessage }, { status: httpStatus });
  }
}
