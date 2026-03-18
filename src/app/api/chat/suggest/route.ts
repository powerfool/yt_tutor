import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { TranscriptSegment } from "@/lib/youtube";
import { getAnthropicApiKey, getPrompt } from "@/lib/settings";

type HistoryMessage = { role: "user" | "assistant"; content: string };
type CurrentChapter = { title: string; startTimeSec: number } | null;

function formatMs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatSec(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return new NextResponse(null, { status: 401 });

  const apiKey = await getAnthropicApiKey();
  if (!apiKey) return new NextResponse(null, { status: 402 });
  const client = new Anthropic({ apiKey });
  const systemPrompt = await getPrompt("chatSystemPrompt");
  const templates = {
    freshNoChapter: await getPrompt("suggestFreshNoChapter"),
    freshWithChapter: await getPrompt("suggestFreshWithChapter"),
    historyWithChapter: await getPrompt("suggestHistoryWithChapter"),
    historyNoChapter: await getPrompt("suggestHistoryNoChapter"),
  };

  const {
    transcript,
    videoTitle,
    currentTimeSec,
    history,
    currentChapter,
  }: {
    transcript: TranscriptSegment[] | null;
    videoTitle: string | null;
    currentTimeSec: number;
    history: HistoryMessage[];
    currentChapter: CurrentChapter;
  } = await req.json();

  // System block 1: full transcript context (cached)
  let block1: string;
  if (transcript && transcript.length > 0) {
    const transcriptText = transcript
      .map((s) => `${formatMs(s.offset)} ${s.text}`)
      .join("\n");
    block1 =
      `${systemPrompt}\n` +
      `Video title: "${videoTitle ?? "Unknown"}"\n\n` +
      `FULL TRANSCRIPT:\n${transcriptText}`;
  } else if (videoTitle) {
    block1 =
      `${systemPrompt}\n` +
      `Video title: "${videoTitle}"\n(No transcript available.)`;
  } else {
    block1 = systemPrompt;
  }

  // System block 2: current position context
  const timeStr = formatSec(currentTimeSec ?? 0);
  const chapterLine = currentChapter
    ? `The learner is in chapter "${currentChapter.title}" (starts at ${formatSec(currentChapter.startTimeSec)}, current position ${timeStr}).`
    : `The learner is at ${timeStr}.`;
  const block2 = chapterLine;

  // Build the user prompt based on context
  const historyMessages = history.filter((m) => m.role === "user" || m.role === "assistant");
  const hasPriorConversation = historyMessages.length > 0;

  const historyContext = hasPriorConversation
    ? `\n\nConversation so far:\n${historyMessages.map((m) => `${m.role === "user" ? "Learner" : "Assistant"}: ${m.content}`).join("\n")}`
    : "";

  let userPrompt: string;

  if (!hasPriorConversation) {
    if (currentChapter) {
      userPrompt = templates.freshWithChapter.replace(/\{\{CHAPTER\}\}/g, currentChapter.title);
    } else {
      userPrompt = templates.freshNoChapter;
    }
  } else if (currentChapter) {
    userPrompt =
      templates.historyWithChapter
        .replace(/\{\{CHAPTER\}\}/g, currentChapter.title)
        .replace(/\{\{TIME\}\}/g, timeStr) +
      historyContext;
  } else {
    userPrompt =
      templates.historyNoChapter.replace(/\{\{TIME\}\}/g, timeStr) +
      historyContext;
  }

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

    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    const suggestions: string[] = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    const trimmed = suggestions.slice(0, 4);
    while (trimmed.length < 4) trimmed.push("Tell me more about this topic.");

    return NextResponse.json({ suggestions: trimmed });
  } catch (err) {
    console.error("[SUGGEST] error:", err);
    return NextResponse.json(
      { suggestions: ["What is this video about?", "Summarize the key points.", "What are the main takeaways?", "Explain the core concepts."] },
      { status: 200 }
    );
  }
}
