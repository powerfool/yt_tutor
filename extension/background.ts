// Background service worker — handles Anthropic API calls and transcript state
console.log("[background] service worker started");

type TranscriptSegment = { offset: number; text: string; duration?: number };

type PageMode = "youtube" | "webpage" | "none";

type WebpageContext = {
  url: string;
  title: string;
  markdownContent: string | null;
};

type AppState = {
  videoId: string | null;
  videoTitle: string | null;
  transcript: TranscriptSegment[] | null;
  hasTranscript: boolean;
  isYoutube: boolean;
  mode: PageMode;
  webpageContext: WebpageContext | null;
  pendingPrefill: string | null; // text to prefill when sidebar next opens
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

// In-memory state (service worker may restart; critical state is backed by storage)
let currentState: AppState = {
  videoId: null,
  videoTitle: null,
  transcript: null,
  hasTranscript: false,
  isYoutube: false,
  mode: "none",
  webpageContext: null,
  pendingPrefill: null,
};

// Per-tab extraction sequence counter. Incremented each time extractFromTab
// starts for a given tab. Results from superseded extractions (e.g. rapid
// navigation A→B where A's fetch finishes after B's) are discarded.
const extractionSeq = new Map<number, number>();

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

function buildWebpageSystemBlocks(context: WebpageContext, pageOnly: boolean) {
  const contentSection = context.markdownContent
    ? `\n\nPAGE CONTENT:\n${context.markdownContent}`
    : "\n\n(No content could be extracted from this page.)";

  const block1 =
    `${PROMPTS.webpageSystem}\n` +
    `Page title: "${context.title}"\n` +
    `URL: ${context.url}` +
    contentSection;

  const block2 = pageOnly ? PROMPTS.webpagePageOnly : PROMPTS.webpageGeneral;

  return [
    { type: "text", text: block1, cache_control: { type: "ephemeral" } },
    { type: "text", text: block2 },
  ];
}

// ── Lazy content extraction helper ───────────────────────────────────────────

async function ensureWebpageContent(ctx: WebpageContext): Promise<WebpageContext> {
  if (ctx.markdownContent !== null) return ctx;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    if (tabId) {
      const result = await chrome.tabs.sendMessage(tabId, { type: "EXTRACT_PAGE_CONTENT" });
      const markdownContent = result?.markdownContent ?? null;
      const updated = { ...ctx, markdownContent };
      // Cache in-memory (never persisted — always fresh on re-visit)
      currentState.webpageContext = updated;
      return updated;
    }
  } catch { /* tab may not be available */ }
  return ctx;
}

// ── Chat streaming ───────────────────────────────────────────────────────────

async function handleChat(payload: {
  message: string;
  history: HistoryMessage[];
  videoOnly: boolean;
  videoId: string | null;
  currentTimeSec: number;
  streamId: string;
  mode?: PageMode;
  webpageContext?: WebpageContext | null;
}) {
  const {
    message, history, videoOnly, videoId, currentTimeSec, streamId,
    mode = "youtube", webpageContext,
  } = payload;

  console.log(`[chat] START streamId=${streamId} mode=${mode} videoId=${videoId} history=${history.length}msgs videoOnly=${videoOnly}`);

  const stored = await chrome.storage.local.get("anthropicApiKey");
  const apiKey = stored.anthropicApiKey as string | undefined;

  console.log(`[chat] API key: ${apiKey ? "present" : "missing"}`);

  if (!apiKey) {
    chrome.runtime.sendMessage({
      type: "CHAT_ERROR",
      streamId,
      error: "no_api_key",
    }).catch(() => {});
    return;
  }

  // Build system blocks based on mode
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let systemBlocks: any[];

  if (mode === "webpage") {
    let ctx = webpageContext ?? currentState.webpageContext;
    if (ctx) {
      ctx = await ensureWebpageContent(ctx);
      systemBlocks = buildWebpageSystemBlocks(ctx, videoOnly);
    } else {
      systemBlocks = [{ type: "text", text: PROMPTS.webpageSystem }];
    }
  } else {
    // YouTube mode — use stored transcript
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

    console.log(`[chat] transcript: ${transcript ? `${transcript.length} segments (loaded from storage)` : "none"}`);
    systemBlocks = buildSystemBlocks(transcript, videoTitle, videoOnly, currentTimeSec);
  }

  try {
    console.log("[chat] calling Anthropic API...");
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        stream: true,
        system: systemBlocks,
        messages: [...history, { role: "user", content: message }],
      }),
    });

    console.log(`[chat] response status: ${response.status}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errMsg = (errorData as any)?.error?.message ?? `HTTP ${response.status}`;
      let userError = `API error ${response.status}: ${errMsg}`;
      if (response.status === 401 && !errMsg.toLowerCase().includes("cors") && !errMsg.toLowerCase().includes("browser")) {
        userError = "Invalid API key. Check your key in Settings.";
      }
      else if (response.status === 402 || (response.status === 400 && errMsg.toLowerCase().includes("credit"))) {
        userError = "Credit balance too low. Top up your Anthropic account.";
      } else if (response.status === 429) userError = "Rate limited. Please wait a moment.";
      else if (response.status === 529) userError = "Anthropic API overloaded. Try again soon.";
      console.log(`[chat] ERROR streamId=${streamId} status=${response.status} errMsg="${errMsg}" → "${userError}"`);
      chrome.runtime.sendMessage({ type: "CHAT_ERROR", streamId, error: userError }).catch(() => {});
      return;
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let totalChars = 0;
    let firstChunkLogged = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode(); // flush any bytes held for multi-byte UTF-8
        break;
      }
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
            if (!firstChunkLogged) {
              console.log(`[chat] streaming... streamId=${streamId}`);
              firstChunkLogged = true;
            }
            totalChars += parsed.delta.text.length;
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

    console.log(`[chat] DONE streamId=${streamId} totalChars=${totalChars}`);
    chrome.runtime.sendMessage({ type: "CHAT_DONE", streamId }).catch(() => {});
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Network error";
    console.log(`[chat] ERROR streamId=${streamId} → "${errMsg}"`);
    chrome.runtime.sendMessage({
      type: "CHAT_ERROR",
      streamId,
      error: errMsg,
    }).catch(() => {});
  }
}

// ── Suggestions ──────────────────────────────────────────────────────────────

async function handleSuggest(payload: {
  videoId: string | null;
  history: HistoryMessage[];
  requestId: string;
  mode?: PageMode;
  webpageContext?: WebpageContext | null;
}) {
  const { videoId, history, requestId, mode = "youtube", webpageContext } = payload;

  const hasPrior = history.filter((m) => m.role === "user" || m.role === "assistant").length > 0;
  console.log(`[suggest] START requestId=${requestId} mode=${mode} videoId=${videoId} history=${history.length}msgs hasPrior=${hasPrior}`);

  const stored = await chrome.storage.local.get("anthropicApiKey");
  const apiKey = stored.anthropicApiKey as string | undefined;

  console.log(`[suggest] API key: ${apiKey ? "present" : "missing"}`);

  if (!apiKey) {
    const defaults = mode === "webpage"
      ? ["What is this page about?", "Summarize the key points.", "What are the main takeaways?", "What questions does this raise?"]
      : ["What is this video about?", "Summarize the key points.", "What are the main takeaways?", "Explain the core concepts."];
    chrome.runtime.sendMessage({ type: "SUGGEST_RESULT", requestId, suggestions: defaults }).catch(() => {});
    return;
  }

  const historyMessages = history.filter((m) => m.role === "user" || m.role === "assistant");
  const historyContext = hasPrior
    ? `\n\nConversation so far:\n${historyMessages.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n")}`
    : "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let systemBlock: any;
  let userPrompt: string;

  if (mode === "webpage") {
    let ctx = webpageContext ?? currentState.webpageContext;
    if (ctx) {
      ctx = await ensureWebpageContent(ctx);
      const contentSection = ctx.markdownContent
        ? `\n\nPAGE CONTENT:\n${ctx.markdownContent}`
        : "\n\n(No content could be extracted from this page.)";
      systemBlock = {
        type: "text",
        text: `${PROMPTS.webpageSystem}\nPage title: "${ctx.title}"\nURL: ${ctx.url}${contentSection}`,
        cache_control: { type: "ephemeral" },
      };
    } else {
      systemBlock = { type: "text", text: PROMPTS.webpageSystem, cache_control: { type: "ephemeral" } };
    }
    userPrompt = hasPrior
      ? PROMPTS.webpageSuggestHistory + historyContext
      : PROMPTS.webpageSuggestFresh;
  } else {
    // YouTube mode
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
    systemBlock = { type: "text", text: block1, cache_control: { type: "ephemeral" } };
    userPrompt = hasPrior
      ? PROMPTS.suggestHistory + historyContext
      : PROMPTS.suggestFresh;
  }

  try {
    console.log("[suggest] calling Anthropic API...");
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        system: [systemBlock],
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    console.log(`[suggest] response status: ${response.status}`);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (data as any).content?.[0]?.type === "text" ? (data as any).content[0].text : "[]";
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    const suggestions: string[] = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    const trimmed = suggestions.slice(0, 4);
    while (trimmed.length < 4) trimmed.push("Tell me more about this topic.");
    console.log(`[suggest] DONE requestId=${requestId} suggestions=${trimmed.length}`);
    chrome.runtime.sendMessage({ type: "SUGGEST_RESULT", requestId, suggestions: trimmed }).catch(() => {});
  } catch (err) {
    console.log(`[suggest] ERROR requestId=${requestId} → fallback suggestions used (${err instanceof Error ? err.message : err})`);
    const fallback = mode === "webpage"
      ? ["What is this page about?", "Summarize the key points.", "What are the main takeaways?", "What questions does this raise?"]
      : ["What is this video about?", "Summarize the key points.", "What are the main takeaways?", "Explain the core concepts."];
    chrome.runtime.sendMessage({ type: "SUGGEST_RESULT", requestId, suggestions: fallback }).catch(() => {});
  }
}

// ── Restore state on service worker restart ──────────────────────────────────

async function restoreState() {
  const stored = await chrome.storage.local.get([
    "currentVideoId", "currentVideoTitle", "currentHasTranscript",
    "currentMode", "currentWebpageUrl", "currentWebpageTitle",
  ]);
  const videoId = stored.currentVideoId as string | null ?? null;
  const mode = (stored.currentMode as PageMode | undefined) ?? (videoId ? "youtube" : "none");

  if (mode === "youtube" && videoId) {
    const transcriptKey = `transcript_${videoId}`;
    const stored2 = await chrome.storage.local.get(transcriptKey);
    const transcript = stored2[transcriptKey] as TranscriptSegment[] | null ?? null;
    currentState = {
      videoId,
      videoTitle: stored.currentVideoTitle as string | null ?? null,
      transcript,
      hasTranscript: stored.currentHasTranscript as boolean ?? false,
      isYoutube: true,
      mode: "youtube",
      webpageContext: null,
      pendingPrefill: null,
    };
    console.log(`[restoreState] youtube videoId=${videoId} hasTranscript=${currentState.hasTranscript} segments=${transcript?.length ?? 0}`);
  } else if (mode === "webpage") {
    const url = stored.currentWebpageUrl as string | null ?? null;
    const title = stored.currentWebpageTitle as string | null ?? "";
    currentState = {
      videoId: null,
      videoTitle: null,
      transcript: null,
      hasTranscript: false,
      isYoutube: false,
      mode: "webpage",
      webpageContext: url ? { url, title, markdownContent: null } : null,
      pendingPrefill: null,
    };
    console.log(`[restoreState] webpage url=${url}`);
  } else {
    console.log("[restoreState] nothing in storage");
  }
}

// Awaitable so GET_STATE can wait for restore before responding
const restorePromise = restoreState();

// ── Direct tab extraction (handles already-open tabs / fresh install) ─────────

// Parse transcript text — handles both json3 and XML formats returned by YouTube
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseTranscriptText(rawText: string): TranscriptSegment[] {
  if (rawText.length < 10) return [];
  if (rawText.trimStart().startsWith("{")) {
    // json3 format
    return parseJson3Transcript(JSON.parse(rawText));
  }
  // XML format (some tracks return XML even with fmt=json3)
  const segments: TranscriptSegment[] = [];
  for (const m of rawText.matchAll(/<text\s+start="([\d.]+)"\s+dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g)) {
    const text = m[3]
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/<[^>]+>/g, "").trim();
    if (text) segments.push({ text, offset: Math.round(parseFloat(m[1]) * 1000), duration: Math.round(parseFloat(m[2]) * 1000) });
  }
  return segments;
}

function broadcastVideoState(videoId: string, videoTitle: string, transcript: TranscriptSegment[] | null, hasTranscript: boolean) {
  console.log(`[broadcastVideoState] videoId=${videoId} title="${videoTitle}" hasTranscript=${hasTranscript} segments=${transcript?.length ?? 0}`);
  currentState = { videoId, videoTitle, transcript, hasTranscript, isYoutube: true, mode: "youtube", webpageContext: null, pendingPrefill: null };
  const payload: Record<string, unknown> = {
    currentVideoId: videoId,
    currentVideoTitle: videoTitle,
    currentHasTranscript: hasTranscript,
    currentMode: "youtube",
  };
  if (transcript && hasTranscript) {
    payload[`transcript_${videoId}`] = transcript;
    payload[`title_${videoId}`] = videoTitle;
  }
  chrome.storage.local.set(payload);
  chrome.runtime.sendMessage({ type: "VIDEO_STATE", videoId, videoTitle, hasTranscript }).catch(() => {});
}

// Extract transcript for a tab. All fetching happens inside MAIN world so that
// YouTube session cookies are automatically included (same-origin requests).
async function extractFromTab(tabId: number) {
  const seq = (extractionSeq.get(tabId) ?? 0) + 1;
  extractionSeq.set(tabId, seq);

  let videoId: string | null = null;
  let videoTitle = "Unknown Video";
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url) videoId = new URL(tab.url).searchParams.get("v");
    if (tab.title) videoTitle = tab.title.replace(/ [-–] YouTube$/, "").trim() || "Unknown Video";
  } catch { return; }
  if (!videoId) return;

  console.log(`[extractFromTab] START tabId=${tabId} seq=${seq} videoId=${videoId}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results = await chrome.scripting.executeScript<[string], any>({
    target: { tabId },
    world: "MAIN",
    func: async (vid: string) => {
      type DebugEntry = { strategy: string; tried: boolean; success: boolean; len: number };
      const debug: DebugEntry[] = [];

      // Helper: fetch a caption URL and return the text (handles empty/error)
      async function fetchCaption(url: string): Promise<string> {
        try {
          const r = await fetch(url, { credentials: "include" });
          return r.ok ? await r.text() : "";
        } catch { return ""; }
      }

      // Helper: pick best English caption track from a tracks array
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function pickTrack(tracks: any[]): any {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return tracks.find((t: any) => t.languageCode === "en") ??
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tracks.find((t: any) => t.languageCode?.startsWith("en")) ??
          tracks[0] ?? null;
      }

      // Extract video title from the player — more reliable than the tab title,
      // which can lag behind on SPA navigation when the service worker runs early.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let extractedTitle: string | null = null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const player = document.getElementById("movie_player") as any;
        if (player?.getPlayerResponse) {
          const r = player.getPlayerResponse();
          if (r?.videoDetails?.videoId === vid) {
            extractedTitle = r.videoDetails.title ?? null;
          }
        }
      } catch { /* ignore */ }
      if (!extractedTitle) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ipr = (window as any).ytInitialPlayerResponse;
        if (ipr?.videoDetails?.videoId === vid) {
          extractedTitle = ipr.videoDetails.title ?? null;
        }
      }

      // Strategy 1: public unsigned timedtext URL — works for most videos without
      // signed parameters, fetched in MAIN world so session cookies are included.
      for (const kind of ["", "asr"]) {
        const stratName = `timedtext_${kind || "manual"}`;
        const u = new URL("https://www.youtube.com/api/timedtext");
        u.searchParams.set("v", vid);
        u.searchParams.set("lang", "en");
        u.searchParams.set("fmt", "json3");
        if (kind) u.searchParams.set("kind", kind);
        const text = await fetchCaption(u.toString());
        debug.push({ strategy: stratName, tried: true, success: text.length > 10, len: text.length });
        if (text.length > 10) return { text, source: stratName, debug, title: extractedTitle };
      }

      // Strategy 2: signed baseUrl from live player element (post-SPA-nav safe)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const player = document.getElementById("movie_player") as any;
      if (player?.getPlayerResponse) {
        try {
          const r = player.getPlayerResponse();
          if (r?.videoDetails?.videoId === vid) {
            const tracks = r?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
            const track = pickTrack(tracks);
            if (track?.baseUrl) {
              const u = new URL(track.baseUrl);
              u.searchParams.set("fmt", "json3");
              const text = await fetchCaption(u.toString());
              debug.push({ strategy: "player_element", tried: true, success: text.length > 10, len: text.length });
              if (text.length > 10) return { text, source: "player_element", debug, title: extractedTitle };
              // Also try raw URL without fmt override
              const text2 = await fetchCaption(track.baseUrl);
              debug.push({ strategy: "player_element_raw", tried: true, success: text2.length > 10, len: text2.length });
              if (text2.length > 10) return { text: text2, source: "player_element_raw", debug, title: extractedTitle };
            } else {
              debug.push({ strategy: "player_element", tried: true, success: false, len: 0 });
            }
          } else {
            debug.push({ strategy: "player_element", tried: true, success: false, len: 0 });
          }
        } catch {
          debug.push({ strategy: "player_element", tried: true, success: false, len: 0 });
        }
      }

      // Strategy 3: signed baseUrl from ytInitialPlayerResponse (page load only)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ipr = (window as any).ytInitialPlayerResponse;
      if (ipr?.videoDetails?.videoId === vid) {
        const tracks = ipr?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
        const track = pickTrack(tracks);
        if (track?.baseUrl) {
          const u = new URL(track.baseUrl);
          u.searchParams.set("fmt", "json3");
          const text = await fetchCaption(u.toString());
          debug.push({ strategy: "ipr", tried: true, success: text.length > 10, len: text.length });
          if (text.length > 10) return { text, source: "ipr", debug, title: extractedTitle };
        } else {
          debug.push({ strategy: "ipr", tried: true, success: false, len: 0 });
        }
      }

      // Strategy 4: Innertube /youtubei/v1/player (same-origin POST with cookies)
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ytcfg = (window as any).ytcfg;
        const apiKey = ytcfg?.get?.("INNERTUBE_API_KEY");
        const clientVersion = ytcfg?.get?.("INNERTUBE_CLIENT_VERSION") || "2.20240101.00.00";
        const sts = ytcfg?.get?.("STS");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = {
          context: { client: { clientName: "WEB", clientVersion, hl: "en" } },
          videoId: vid,
        };
        if (sts) body.playbackContext = { contentPlaybackContext: { signatureTimestamp: sts, html5Preference: "HTML5_PREF_WANTS" } };
        const res = await fetch(`/youtubei/v1/player${apiKey ? `?key=${apiKey}` : ""}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.videoDetails?.videoId === vid) {
            const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
            const track = pickTrack(tracks);
            if (track?.baseUrl) {
              const u = new URL(track.baseUrl);
              u.searchParams.set("fmt", "json3");
              const text = await fetchCaption(u.toString());
              debug.push({ strategy: "innertube", tried: true, success: text.length > 10, len: text.length });
              if (text.length > 10) return { text, source: "innertube", debug, title: extractedTitle };
            } else {
              debug.push({ strategy: "innertube", tried: true, success: false, len: 0 });
            }
          } else {
            debug.push({ strategy: "innertube", tried: true, success: false, len: 0 });
          }
        } else {
          debug.push({ strategy: "innertube", tried: true, success: false, len: 0 });
        }
      } catch {
        debug.push({ strategy: "innertube", tried: true, success: false, len: 0 });
      }

      return { text: "", source: "none", debug, title: extractedTitle };
    },
    args: [videoId],
  });

  if (extractionSeq.get(tabId) !== seq) {
    console.log(`[extractFromTab] STALE seq=${seq} (current=${extractionSeq.get(tabId)}), discarding ${videoId}`);
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = results?.[0]?.result as any;

  // Prefer the title extracted from the player in MAIN world — it's always up-to-date
  // after SPA navigation. Fall back to the tab title captured at function start.
  if (r?.title) {
    videoTitle = r.title;
    console.log(`[extractFromTab] title from player: "${videoTitle}"`);
  }

  // Log per-strategy debug info from the injected script
  if (r?.debug) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const d of r.debug as any[]) {
      console.log(`[extractFromTab] strategy=${d.strategy} success=${d.success} len=${d.len}`);
    }
  }

  if (r?.text?.length > 10) {
    const segments = parseTranscriptText(r.text);
    console.log(`[extractFromTab] DONE videoId=${videoId} source=${r.source} segments=${segments.length}`);
    broadcastVideoState(videoId, videoTitle, segments.length > 0 ? segments : null, segments.length > 0);
  } else {
    console.log(`[extractFromTab] NO TRANSCRIPT videoId=${videoId} (source=${r?.source ?? "none"})`);
    broadcastVideoState(videoId, videoTitle, null, false);
  }
}

// ── Setup ────────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  // Inject into already-open YouTube tabs (fresh install won't have run content scripts)
  const tabs = await chrome.tabs.query({ url: "*://*.youtube.com/watch*" });
  console.log(`[onInstalled] found ${tabs.length} open YouTube tab(s) → extracting`);
  for (const tab of tabs) {
    if (tab.id) extractFromTab(tab.id);
  }
});

// Also set on startup (in case service worker restarted)
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// Extract when any YouTube watch page finishes loading
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url?.includes("youtube.com/watch")) {
    console.log(`[tabs.onUpdated] tabId=${tabId} status=complete url=${tab.url} → extracting`);
    extractFromTab(tabId);
  }
});

// ── Message handler ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
chrome.runtime.onMessage.addListener((msg: any, sender, sendResponse) => {
  // Content script notifies us when YouTube SPA-navigates to a new video.
  if (msg.type === "YOUTUBE_NAVIGATED") {
    const tabId = sender.tab?.id;
    console.log(`[background] YOUTUBE_NAVIGATED tabId=${tabId} → queuing extract in 600ms`);
    if (tabId) {
      setTimeout(() => extractFromTab(tabId), 600);
    }
    sendResponse({ ok: true });
    return true;
  }

  // Non-YouTube content script notifies us of page navigation
  if (msg.type === "WEBPAGE_NAVIGATED") {
    const { url, title } = msg as { url: string; title: string };
    console.log(`[background] WEBPAGE_NAVIGATED url=${url} title="${title}"`);
    // Reset markdownContent on every navigation — always re-extract on next interaction
    currentState = {
      ...currentState,
      videoId: null,
      videoTitle: null,
      transcript: null,
      hasTranscript: false,
      isYoutube: false,
      mode: "webpage",
      webpageContext: { url, title, markdownContent: null },
    };
    chrome.storage.local.set({
      currentMode: "webpage",
      currentWebpageUrl: url,
      currentWebpageTitle: title,
      currentVideoId: null,
    });
    chrome.runtime.sendMessage({
      type: "WEBPAGE_STATE",
      webpageContext: currentState.webpageContext,
    }).catch(() => {});
    sendResponse({ ok: true });
    return true;
  }

  // Non-YouTube content script reports a text selection → relay to sidebar (or hold for when it opens)
  if (msg.type === "WEBPAGE_SELECTION") {
    const { selectedText } = msg as { selectedText: string };
    console.log(`[background] WEBPAGE_SELECTION len=${selectedText.length}`);
    // Store for sidebar that isn't open yet; also broadcast for one that is
    currentState.pendingPrefill = selectedText;
    chrome.runtime.sendMessage({ type: "PREFILL_INPUT", selectedText }).catch(() => {});
    sendResponse({ ok: true });
    return true;
  }

  // Content script requests sidebar open (after user clicks "Ask AI" button)
  if (msg.type === "OPEN_SIDEBAR") {
    const tabId = sender.tab?.id;
    console.log(`[background] OPEN_SIDEBAR tabId=${tabId}`);
    if (tabId) {
      chrome.sidePanel.open({ tabId }).catch(() => {});
    }
    sendResponse({ ok: true });
    return true;
  }

  // Sidebar requests immediate extraction for a specific tab (e.g., on open)
  if (msg.type === "EXTRACT_TAB") {
    console.log(`[background] EXTRACT_TAB tabId=${msg.tabId}`);
    const tabId = msg.tabId as number | undefined;
    if (tabId) extractFromTab(tabId);
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "GET_STATE") {
    console.log(`[background] GET_STATE → mode=${currentState.mode} videoId=${currentState.videoId} hasTranscript=${currentState.hasTranscript}`);
    restorePromise.then(() => {
      const pendingPrefill = currentState.pendingPrefill;
      currentState.pendingPrefill = null; // consume once
      sendResponse({
        videoId: currentState.videoId,
        videoTitle: currentState.videoTitle,
        hasTranscript: currentState.hasTranscript,
        isYoutube: currentState.isYoutube,
        mode: currentState.mode,
        webpageContext: currentState.webpageContext,
        pendingPrefill,
      });
    });
    return true; // keep channel open for async response
  }

  if (msg.type === "CHAT") {
    console.log(`[background] CHAT streamId=${msg.payload?.streamId}`);
    handleChat(msg.payload);
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "SUGGEST") {
    console.log(`[background] SUGGEST requestId=${msg.payload?.requestId}`);
    handleSuggest(msg.payload);
    sendResponse({ ok: true });
    return true;
  }

  return true;
});
