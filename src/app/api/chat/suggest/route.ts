import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { TranscriptSegment } from "@/lib/youtube";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
      `You are a helpful research assistant helping a learner study a YouTube video.\n` +
      `Video title: "${videoTitle ?? "Unknown"}"\n\n` +
      `FULL TRANSCRIPT:\n${transcriptText}`;
  } else if (videoTitle) {
    block1 =
      `You are a helpful research assistant helping a learner study a YouTube video.\n` +
      `Video title: "${videoTitle}"\n(No transcript available.)`;
  } else {
    block1 = `You are a helpful research assistant helping a learner study a YouTube video.`;
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
    // Fresh start — let Claude decide what's most interesting to explore
    if (currentChapter) {
      userPrompt =
        `The learner just opened this video and is starting in the chapter "${currentChapter.title}". ` +
        `Generate 4 varied questions that will help them understand and engage with this topic. ` +
        `Mix conceptual questions ("What is...?"), application questions ("How would you use...?"), ` +
        `and deeper-dive questions. Don't just ask for definitions.\n` +
        `Return ONLY a JSON array of 4 strings, no explanation, no markdown fences.`;
    } else {
      userPrompt =
        `The learner just opened this video. Based on the title and content, ` +
        `generate 4 varied questions that will spark curiosity and help them engage deeply with the material. ` +
        `Mix different angles: core concepts, implications, comparisons, and "why does this matter?" questions. ` +
        `Return ONLY a JSON array of 4 strings, no explanation, no markdown fences.`;
    }
  } else if (currentChapter) {
    // Has conversation history + chapter context — focus on current chapter, avoid repeating discussed topics
    userPrompt =
      `The learner is currently in the chapter "${currentChapter.title}" (at ${timeStr}). ` +
      `Based on this chapter's content and the conversation so far, generate 4 follow-up questions ` +
      `that go deeper into "${currentChapter.title}" or connect it to what was already discussed. ` +
      `Avoid questions that were already answered in the conversation.` +
      `Return ONLY a JSON array of 4 strings, no explanation, no markdown fences.` +
      historyContext;
  } else {
    // Has conversation history, no chapter context — build on the conversation
    userPrompt =
      `The learner is at ${timeStr} and has been having a conversation about this video. ` +
      `Generate 4 natural follow-up questions based on what they've discussed and what's coming up in the video. ` +
      `Avoid questions already answered. Keep questions concise and specific.\n` +
      `Return ONLY a JSON array of 4 strings, no explanation, no markdown fences.` +
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
