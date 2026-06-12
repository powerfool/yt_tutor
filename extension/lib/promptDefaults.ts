export type PromptKey =
  | "system"
  | "videoOnly"
  | "general"
  | "suggestFresh"
  | "suggestHistory"
  | "webpageSystem"
  | "webpagePageOnly"
  | "webpageGeneral"
  | "webpageSuggestFresh"
  | "webpageSuggestHistory";

export const DEFAULT_PROMPTS: Record<PromptKey, string> = {
  system:
    "You are a helpful research assistant helping a learner study a YouTube video.",
  videoOnly:
    "Answer using the full video transcript. Do not bring in any knowledge, facts, or opinions from outside this video.",
  general:
    "Use both the video content and your general knowledge to give the most helpful answer.",
  suggestFresh:
    'The learner just opened this video. Based on the title and content, generate 4 varied questions that will spark curiosity and help them engage deeply with the material. Mix different angles: core concepts, implications, comparisons, and "why does this matter?" questions. Return ONLY a JSON array of 4 strings, no explanation, no markdown fences.',
  suggestHistory:
    "The learner has been having a conversation about this video. Generate 4 natural follow-up questions based on what they've discussed. Avoid questions already answered. Keep questions concise and specific.\nReturn ONLY a JSON array of 4 strings, no explanation, no markdown fences.",
  webpageSystem:
    "You are a helpful research assistant. The user is reading a webpage and has questions about its content.",
  webpagePageOnly:
    "Answer only based on the page content provided. Do not draw on outside knowledge.",
  webpageGeneral:
    "Use the provided page content and your general knowledge to give the most helpful answer.",
  webpageSuggestFresh:
    "Based on the page title and content, generate 4 varied questions to spark curiosity. Return ONLY a JSON array of 4 strings.",
  webpageSuggestHistory:
    "Generate 4 natural follow-up questions based on the conversation so far. Return ONLY a JSON array of 4 strings.",
};

export type PromptDef = {
  key: PromptKey;
  label: string;
  description: string;
};

export const YOUTUBE_PROMPT_DEFS: PromptDef[] = [
  {
    key: "system",
    label: "System prompt",
    description: "Base role instruction sent with every YouTube chat message.",
  },
  {
    key: "videoOnly",
    label: "Focus mode instruction",
    description: "Used when Focus mode is on — restricts Claude to the transcript only.",
  },
  {
    key: "general",
    label: "General mode instruction",
    description: "Used when Focus mode is off — allows Claude to use outside knowledge.",
  },
  {
    key: "suggestFresh",
    label: "Opening suggestions",
    description: "Prompt used to generate the first 4 question suggestions.",
  },
  {
    key: "suggestHistory",
    label: "Follow-up suggestions",
    description: "Prompt used to generate follow-up suggestions after the conversation starts.",
  },
];

export const WEBPAGE_PROMPT_DEFS: PromptDef[] = [
  {
    key: "webpageSystem",
    label: "System prompt",
    description: "Base role instruction sent with every webpage chat message.",
  },
  {
    key: "webpagePageOnly",
    label: "Focus mode instruction",
    description: "Used when Focus mode is on — restricts Claude to the page content only.",
  },
  {
    key: "webpageGeneral",
    label: "General mode instruction",
    description: "Used when Focus mode is off — allows Claude to use outside knowledge.",
  },
  {
    key: "webpageSuggestFresh",
    label: "Opening suggestions",
    description: "Prompt used to generate the first 4 question suggestions.",
  },
  {
    key: "webpageSuggestHistory",
    label: "Follow-up suggestions",
    description: "Prompt used to generate follow-up suggestions after the conversation starts.",
  },
];
