// Background service worker — handles Anthropic API calls and transcript state
console.log("[background] service worker started");

type TranscriptSegment = { offset: number; text: string; duration?: number };

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
  currentState = { videoId, videoTitle, transcript, hasTranscript, isYoutube: true };
  const payload: Record<string, unknown> = { currentVideoId: videoId, currentVideoTitle: videoTitle, currentHasTranscript: hasTranscript };
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results = await chrome.scripting.executeScript<[string], any>({
    target: { tabId },
    world: "MAIN",
    func: async (vid: string) => {
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

      // Strategy 1: public unsigned timedtext URL — works for most videos without
      // signed parameters, fetched in MAIN world so session cookies are included.
      for (const kind of ["", "asr"]) {
        const u = new URL("https://www.youtube.com/api/timedtext");
        u.searchParams.set("v", vid);
        u.searchParams.set("lang", "en");
        u.searchParams.set("fmt", "json3");
        if (kind) u.searchParams.set("kind", kind);
        const text = await fetchCaption(u.toString());
        if (text.length > 10) return { text, source: `timedtext_${kind || "manual"}` };
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
              if (text.length > 10) return { text, source: "player_element" };
              // Also try raw URL without fmt override
              const text2 = await fetchCaption(track.baseUrl);
              if (text2.length > 10) return { text: text2, source: "player_element_raw" };
            }
          }
        } catch { /* ignore */ }
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
          if (text.length > 10) return { text, source: "ipr" };
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
              if (text.length > 10) return { text, source: "innertube" };
            }
          }
        }
      } catch { /* ignore */ }

      return { text: "", source: "none" };
    },
    args: [videoId],
  });

  if (extractionSeq.get(tabId) !== seq) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = results?.[0]?.result as any;
  console.log("[extractFromTab]", videoId, "source:", r?.source, "len:", r?.text?.length ?? 0);

  if (r?.text?.length > 10) {
    const segments = parseTranscriptText(r.text);
    broadcastVideoState(videoId, videoTitle, segments.length > 0 ? segments : null, segments.length > 0);
  } else {
    broadcastVideoState(videoId, videoTitle, null, false);
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
chrome.runtime.onMessage.addListener((msg: any, sender, sendResponse) => {
  console.log("[background] message received:", msg.type, "from tab:", sender.tab?.id);
  // Content script notifies us when YouTube SPA-navigates to a new video.
  // The content script can't read ytInitialPlayerResponse (isolated world),
  // so we use extractFromTab (world:"MAIN") from the background instead.
  if (msg.type === "YOUTUBE_NAVIGATED") {
    const tabId = sender.tab?.id;
    if (tabId) {
      // Delay slightly so YouTube has time to update ytInitialPlayerResponse
      setTimeout(() => extractFromTab(tabId), 600);
    }
    sendResponse({ ok: true });
    return true;
  }

  // Sidebar requests immediate extraction for a specific tab (e.g., on open)
  if (msg.type === "EXTRACT_TAB") {
    const tabId = msg.tabId as number | undefined;
    if (tabId) extractFromTab(tabId);
    sendResponse({ ok: true });
    return true;
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
