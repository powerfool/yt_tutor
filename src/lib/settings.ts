// Server-only module
import { prisma } from "@/lib/prisma";

type SettingsRow = Record<string, string | null>;

// Per-user in-memory cache
const cache = new Map<string, SettingsRow | null>();

async function loadSettings(userId: string): Promise<SettingsRow | null> {
  const row = await prisma.userSettings.findUnique({ where: { userId } });
  return row as SettingsRow | null;
}

export async function getSettings(userId: string): Promise<SettingsRow | null> {
  if (cache.has(userId)) return cache.get(userId) ?? null;
  const settings = await loadSettings(userId);
  cache.set(userId, settings);
  return settings;
}

export function invalidateSettingsCache(userId: string) {
  cache.delete(userId);
}

export async function getAnthropicApiKey(userId: string): Promise<string | undefined> {
  const s = await getSettings(userId);
  return s?.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
}

export async function getYoutubeApiKey(userId: string): Promise<string | undefined> {
  const s = await getSettings(userId);
  return s?.youtubeApiKey || process.env.YOUTUBE_API_KEY;
}

export const PROMPT_DEFAULTS = {
  chatSystemPrompt:
    "You are a helpful research assistant helping a learner study a YouTube video.",
  chatVideoOnlyPrompt:
    "Answer using the full video transcript. Do not bring in any knowledge, facts, or opinions from outside this video.",
  chatGeneralPrompt:
    "Use both the video content and your general knowledge to give the most helpful answer.",
  suggestFreshNoChapter: `The learner just opened this video. Based on the title and content, generate 4 varied questions that will spark curiosity and help them engage deeply with the material. Mix different angles: core concepts, implications, comparisons, and "why does this matter?" questions. Return ONLY a JSON array of 4 strings, no explanation, no markdown fences.`,
  suggestFreshWithChapter: `The learner just opened this video and is starting in the chapter "{{CHAPTER}}". Generate 4 varied questions that will help them understand and engage with this topic. Mix conceptual questions ("What is...?"), application questions ("How would you use...?"), and deeper-dive questions. Don't just ask for definitions.\nReturn ONLY a JSON array of 4 strings, no explanation, no markdown fences.`,
  suggestHistoryWithChapter: `The learner is currently in the chapter "{{CHAPTER}}" (at {{TIME}}). Based on this chapter's content and the conversation so far, generate 4 follow-up questions that go deeper into "{{CHAPTER}}" or connect it to what was already discussed. Avoid questions that were already answered in the conversation. Return ONLY a JSON array of 4 strings, no explanation, no markdown fences.`,
  suggestHistoryNoChapter: `The learner is at {{TIME}} and has been having a conversation about this video. Generate 4 natural follow-up questions based on what they've discussed and what's coming up in the video. Avoid questions already answered. Keep questions concise and specific.\nReturn ONLY a JSON array of 4 strings, no explanation, no markdown fences.`,
  chaptersSystemPrompt:
    "You are a precise JSON-only assistant. Never output anything outside a JSON array.",
  chaptersUserPrompt: `Return ONLY a JSON array of chapters. Each chapter needs a short title (3–6 words) and the startTimeSec (integer seconds) where that topic begins.\nRules:\n- Identify 4–8 chapters depending on video length\n- First chapter MUST start at 0\n- startTimeSec values must be plausible given the timestamps in the transcript\n- Return valid JSON only, no markdown fences, no explanation\nExample: [{"title":"Introduction","startTimeSec":0},{"title":"Core Concepts","startTimeSec":120}]`,
};

export type PromptKey = keyof typeof PROMPT_DEFAULTS;

export async function getPrompt(userId: string, key: PromptKey): Promise<string> {
  const s = await getSettings(userId);
  const override = s?.[key] as string | null | undefined;
  return override || PROMPT_DEFAULTS[key];
}
