// Background service worker — handles Anthropic API calls and transcript state

type TranscriptSegment = { offset: number; text: string };

type VideoState = {
  videoId: string | null;
  videoTitle: string | null;
  transcript: TranscriptSegment[] | null;
  hasTranscript: boolean;
  isYoutube: boolean;
};

type HistoryMessage = { role: "user" | "assistant"; content: string };

// Prompt defaults (mirrors src/lib/settings.ts)
const PROMPTS = {
  system:
    "You are a helpful research assistant helping a learner study a YouTube video.",
  videoOnly:
    "Answer using the full video transcript. Do not bring in any knowledge, facts, or opinions from outside this video.",
  general:
    "Use both the video content and your general knowledge to give the most helpful answer.",
  suggestFresh:
    "The learner just opened this video. Based on the title and content, generate 4 varied questions that will spark curiosity and help them engage deeply with the material. Mix different angles: core concepts, implications, comparisons, and \"why does this matter?\" questions. Return ONLY a JSON array of 4 strings, no explanation, no markdown fences.",
  suggestHistory:
    "The learner has been having a conversation about this video. Generate 4 natural follow-up questions based on what they've discussed. Avoid questions already answered. Keep questions concise and specific.\nReturn ONLY a JSON array of 4 strings, no explanation, no markdown fences.",
};

// In-memory state (service worker may restart; critical state is backed by storage)
let currentState: VideoState = {
  videoId: null,
  videoTitle: null,
  transcript: null,
  hasTranscript: false,
  isYoutube: false,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseJson3Transcript(data: any): TranscriptSegment[] {
  const events = data?.events ?? [];
  const segments: TranscriptSegment[] = [];
  for (const event of events) {
    if (!event.segs) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = event.segs.map((s: any) => s.utf8 ?? "").join("").trim();
    if (text && text !== "\n") {
      segments.push({ offset: event.tStartMs ?? 0, text });
    }
  }
  return segments;
}

function buildSystemBlocks(
  transcript: TranscriptSegment[] | null,
  videoTitle: string | null,
  videoOnly: boolean,
  currentTimeSec: number
) {
  let block1: string;
  if (transcript && transcript.length > 0) {
    const transcriptText = transcript
      .map((s) => `${formatMs(s.offset)} ${s.text}`)
      .join("\n");
    block1 =
      `${PROMPTS.system}\n` +
      `The video is titled: "${videoTitle ?? "Unknown"}"\n\n` +
      `FULL TRANSCRIPT:\n${transcriptText}`;
  } else if (videoTitle) {
    block1 =
      `${PROMPTS.system}\n` +
      `The video is titled: "${videoTitle}"\n` +
      `(No transcript available for this video.)`;
  } else {
    block1 = PROMPTS.system;
  }

  const timeStr = formatSec(currentTimeSec ?? 0);
  const block2 = `The learner is currently at ${timeStr}.\n${videoOnly ? PROMPTS.videoOnly : PROMPTS.general}`;

  return [
    { type: "text", text: block1, cache_control: { type: "ephemeral" } },
    { type: "text", text: block2 },
  ];
}

// ── Chat streaming ───────────────────────────────────────────────────────────

async function handleChat(payload: {
  message: string;
  history: HistoryMessage[];
  videoOnly: boolean;
  videoId: string | null;
  currentTimeSec: number;
  streamId: string;
}) {
  const { message, history, videoOnly, videoId, currentTimeSec, streamId } = payload;

  const stored = await chrome.storage.local.get("anthropicApiKey");
  const apiKey = stored.anthropicApiKey as string | undefined;

  if (!apiKey) {
    chrome.runtime.sendMessage({
      type: "CHAT_ERROR",
      streamId,
      error: "no_api_key",
    }).catch(() => {});
    return;
  }

  // Use stored transcript for this video
  let transcript: TranscriptSegment[] | null = null;
  let videoTitle: string | null = null;

  if (videoId) {
    const key = `transcript_${videoId}`;
    const titleKey = `title_${videoId}`;
    const stored2 = await chrome.storage.local.get([key, titleKey]);
    const raw = stored2[key];
    transcript = raw ? (raw as TranscriptSegment[]) : null;
    videoTitle = stored2[titleKey] as string | null ?? null;
  }

  const systemBlocks = buildSystemBlocks(transcript, videoTitle, videoOnly, currentTimeSec);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        stream: true,
        system: systemBlocks,
        messages: [...history, { role: "user", content: message }],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errMsg = (errorData as any)?.error?.message ?? `HTTP ${response.status}`;
      let userError = "Something went wrong with the AI. Please try again.";
      if (response.status === 401) userError = "Invalid API key. Check your key in Settings.";
      else if (response.status === 402 || (response.status === 400 && errMsg.toLowerCase().includes("credit"))) {
        userError = "Credit balance too low. Top up your Anthropic account.";
      } else if (response.status === 429) userError = "Rate limited. Please wait a moment.";
      else if (response.status === 529) userError = "Anthropic API overloaded. Try again soon.";
      chrome.runtime.sendMessage({ type: "CHAT_ERROR", streamId, error: userError }).catch(() => {});
      return;
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          if (
            parsed.type === "content_block_delta" &&
            parsed.delta?.type === "text_delta"
          ) {
            chrome.runtime.sendMessage({
              type: "CHAT_CHUNK",
              streamId,
              chunk: parsed.delta.text,
            }).catch(() => {});
          }
        } catch {
          // malformed SSE line — skip
        }
      }
    }

    chrome.runtime.sendMessage({ type: "CHAT_DONE", streamId }).catch(() => {});
  } catch (err) {
    chrome.runtime.sendMessage({
      type: "CHAT_ERROR",
      streamId,
      error: err instanceof Error ? err.message : "Network error",
    }).catch(() => {});
  }
}

// ── Suggestions ──────────────────────────────────────────────────────────────

async function handleSuggest(payload: {
  videoId: string | null;
  history: HistoryMessage[];
  requestId: string;
}) {
  const { videoId, history, requestId } = payload;

  const stored = await chrome.storage.local.get("anthropicApiKey");
  const apiKey = stored.anthropicApiKey as string | undefined;

  if (!apiKey) {
    chrome.runtime.sendMessage({
      type: "SUGGEST_RESULT",
      requestId,
      suggestions: ["What is this video about?", "Summarize the key points.", "What are the main takeaways?", "Explain the core concepts."],
    }).catch(() => {});
    return;
  }

  let transcript: TranscriptSegment[] | null = null;
  let videoTitle: string | null = null;

  if (videoId) {
    const key = `transcript_${videoId}`;
    const titleKey = `title_${videoId}`;
    const stored2 = await chrome.storage.local.get([key, titleKey]);
    const raw = stored2[key];
    transcript = raw ? (raw as TranscriptSegment[]) : null;
    videoTitle = stored2[titleKey] as string | null ?? null;
  }

  let block1: string;
  if (transcript && transcript.length > 0) {
    const transcriptText = transcript.map((s) => `${formatMs(s.offset)} ${s.text}`).join("\n");
    block1 = `${PROMPTS.system}\nVideo title: "${videoTitle ?? "Unknown"}"\n\nFULL TRANSCRIPT:\n${transcriptText}`;
  } else if (videoTitle) {
    block1 = `${PROMPTS.system}\nVideo title: "${videoTitle}"\n(No transcript available.)`;
  } else {
    block1 = PROMPTS.system;
  }

  const historyMessages = history.filter((m) => m.role === "user" || m.role === "assistant");
  const hasPrior = historyMessages.length > 0;

  const historyContext = hasPrior
    ? `\n\nConversation so far:\n${historyMessages.map((m) => `${m.role === "user" ? "Learner" : "Assistant"}: ${m.content}`).join("\n")}`
    : "";

  const userPrompt = hasPrior
    ? PROMPTS.suggestHistory + historyContext
    : PROMPTS.suggestFresh;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        system: [
          { type: "text", text: block1, cache_control: { type: "ephemeral" } },
        ],
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (data as any).content?.[0]?.type === "text" ? (data as any).content[0].text : "[]";
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    const suggestions: string[] = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    const trimmed = suggestions.slice(0, 4);
    while (trimmed.length < 4) trimmed.push("Tell me more about this topic.");
    chrome.runtime.sendMessage({ type: "SUGGEST_RESULT", requestId, suggestions: trimmed }).catch(() => {});
  } catch {
    chrome.runtime.sendMessage({
      type: "SUGGEST_RESULT",
      requestId,
      suggestions: ["What is this video about?", "Summarize the key points.", "What are the main takeaways?", "Explain the core concepts."],
    }).catch(() => {});
  }
}

// ── Restore state on service worker restart ──────────────────────────────────

async function restoreState() {
  const stored = await chrome.storage.local.get(["currentVideoId", "currentVideoTitle", "currentHasTranscript"]);
  const videoId = stored.currentVideoId as string | null ?? null;
  if (videoId) {
    const transcriptKey = `transcript_${videoId}`;
    const stored2 = await chrome.storage.local.get(transcriptKey);
    currentState = {
      videoId,
      videoTitle: stored.currentVideoTitle as string | null ?? null,
      transcript: stored2[transcriptKey] as TranscriptSegment[] | null ?? null,
      hasTranscript: stored.currentHasTranscript as boolean ?? false,
      isYoutube: true,
    };
  }
}

// Awaitable so GET_STATE can wait for restore before responding
const restorePromise = restoreState();

// ── Direct tab extraction (handles already-open tabs / fresh install) ─────────

async function extractFromTab(tabId: number) {
  type PlayerData = {
    videoId: string;
    videoTitle: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tracks: any[];
  } | null;

  // Retry up to 4 times — YouTube sets ytInitialPlayerResponse slightly after
  // the page's load event, so document_complete doesn't guarantee it's ready.
  let data: PlayerData = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, attempt * 800));
    let results: chrome.scripting.InjectionResult<PlayerData>[] | null = null;
    try {
      results = await chrome.scripting.executeScript<[], PlayerData>({
        target: { tabId },
        // MAIN world so we can read ytInitialPlayerResponse set by page scripts
        world: "MAIN",
        func: () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const player = (window as any).ytInitialPlayerResponse;
          if (!player?.videoDetails?.videoId) return null;
          return {
            videoId: player.videoDetails.videoId,
            videoTitle: player.videoDetails.title ?? "Unknown Video",
            tracks: player?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [],
          };
        },
      });
    } catch {
      return; // tab not ready or not injectable
    }
    data = results?.[0]?.result ?? null;
    if (data?.videoId) break;
  }

  if (!data?.videoId) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const track = data.tracks.find((t: any) => t.languageCode === "en") ?? data.tracks[0];
  if (!track) {
    currentState = { videoId: data.videoId, videoTitle: data.videoTitle, transcript: null, hasTranscript: false, isYoutube: true };
    chrome.storage.local.set({ currentVideoId: data.videoId, currentVideoTitle: data.videoTitle, currentHasTranscript: false });
    chrome.runtime.sendMessage({ type: "VIDEO_STATE", videoId: data.videoId, videoTitle: data.videoTitle, hasTranscript: false }).catch(() => {});
    return;
  }

  try {
    const captionUrl = new URL(track.baseUrl);
    captionUrl.searchParams.set("fmt", "json3");
    const transcriptData = await fetch(captionUrl.toString()).then((r) => r.json());
    const segments = parseJson3Transcript(transcriptData);
    currentState = { videoId: data.videoId, videoTitle: data.videoTitle, transcript: segments, hasTranscript: true, isYoutube: true };
    chrome.storage.local.set({
      currentVideoId: data.videoId,
      currentVideoTitle: data.videoTitle,
      currentHasTranscript: true,
      [`transcript_${data.videoId}`]: segments,
      [`title_${data.videoId}`]: data.videoTitle,
    });
    chrome.runtime.sendMessage({ type: "VIDEO_STATE", videoId: data.videoId, videoTitle: data.videoTitle, hasTranscript: true }).catch(() => {});
  } catch {
    currentState = { videoId: data.videoId, videoTitle: data.videoTitle, transcript: null, hasTranscript: false, isYoutube: true };
    chrome.storage.local.set({ currentVideoId: data.videoId, currentVideoTitle: data.videoTitle, currentHasTranscript: false });
    chrome.runtime.sendMessage({ type: "VIDEO_STATE", videoId: data.videoId, videoTitle: data.videoTitle, hasTranscript: false }).catch(() => {});
  }
}

// ── Setup ────────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  // Inject into already-open YouTube tabs (fresh install won't have run content scripts)
  const tabs = await chrome.tabs.query({ url: "*://*.youtube.com/watch*" });
  for (const tab of tabs) {
    if (tab.id) extractFromTab(tab.id);
  }
});

// Also set on startup (in case service worker restarted)
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// Extract when any YouTube watch page finishes loading
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url?.includes("youtube.com/watch")) {
    extractFromTab(tabId);
  }
});

// ── Message handler ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
chrome.runtime.onMessage.addListener((msg: any, _sender, sendResponse) => {
  if (msg.type === "TRANSCRIPT_READY") {
    const segments = parseJson3Transcript(msg.transcript);
    currentState = {
      videoId: msg.videoId,
      videoTitle: msg.videoTitle,
      transcript: segments,
      hasTranscript: true,
      isYoutube: true,
    };
    // Persist to storage so it survives service worker restarts
    chrome.storage.local.set({
      currentVideoId: msg.videoId,
      currentVideoTitle: msg.videoTitle,
      currentHasTranscript: true,
      [`transcript_${msg.videoId}`]: segments,
      [`title_${msg.videoId}`]: msg.videoTitle,
    });
    chrome.runtime.sendMessage({
      type: "VIDEO_STATE",
      videoId: msg.videoId,
      videoTitle: msg.videoTitle,
      hasTranscript: true,
    }).catch(() => {});
    sendResponse({ ok: true });
  }

  if (msg.type === "TRANSCRIPT_UNAVAILABLE") {
    currentState = {
      videoId: msg.videoId,
      videoTitle: msg.videoTitle,
      transcript: null,
      hasTranscript: false,
      isYoutube: true,
    };
    chrome.storage.local.set({
      currentVideoId: msg.videoId,
      currentVideoTitle: msg.videoTitle,
      currentHasTranscript: false,
    });
    chrome.runtime.sendMessage({
      type: "VIDEO_STATE",
      videoId: msg.videoId,
      videoTitle: msg.videoTitle,
      hasTranscript: false,
    }).catch(() => {});
    sendResponse({ ok: true });
  }

  if (msg.type === "NOT_YOUTUBE") {
    currentState = { videoId: null, videoTitle: null, transcript: null, hasTranscript: false, isYoutube: false };
    chrome.storage.local.set({ currentVideoId: null });
    chrome.runtime.sendMessage({ type: "VIDEO_STATE", videoId: null, videoTitle: null, hasTranscript: false }).catch(() => {});
    sendResponse({ ok: true });
  }

  if (msg.type === "GET_STATE") {
    restorePromise.then(() => {
      sendResponse({
        videoId: currentState.videoId,
        videoTitle: currentState.videoTitle,
        hasTranscript: currentState.hasTranscript,
        isYoutube: currentState.isYoutube,
      });
    });
    return true; // keep channel open for async response
  }

  if (msg.type === "CHAT") {
    handleChat(msg.payload);
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "SUGGEST") {
    handleSuggest(msg.payload);
    sendResponse({ ok: true });
    return true;
  }

  return true;
});
