"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import ChatPanel from "../components/ChatPanel";
import NotebookPanel, { NotebookHandle } from "../components/NotebookPanel";
import SettingsPanel from "../components/SettingsPanel";

type Layout = "chat" | "both" | "notebook";

const LAYOUT_CYCLE: Layout[] = ["chat", "both", "notebook"];

function nextLayout(current: Layout): Layout {
  const idx = LAYOUT_CYCLE.indexOf(current);
  return LAYOUT_CYCLE[(idx + 1) % LAYOUT_CYCLE.length];
}

function IconLayoutDestination({ current }: { current: Layout }) {
  // Shows the destination layout as two small panel rectangles
  const chatFilled   = current === "chat"     ? "fill-current" : "fill-none stroke-current";
  const noteFilled   = current === "notebook" ? "fill-current" : "fill-none stroke-current";
  const bothFilled   = "fill-current";

  // Destination: chat→both, both→notebook, notebook→chat
  let leftFill: string, rightFill: string;
  switch (current) {
    case "chat":     leftFill = bothFilled;  rightFill = bothFilled;  break;
    case "both":     leftFill = "fill-none stroke-current"; rightFill = bothFilled; break;
    case "notebook": leftFill = bothFilled;  rightFill = "fill-none stroke-current"; break;
  }

  return (
    <svg width="18" height="11" viewBox="0 0 18 11" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
      <rect x="0.5" y="0.5" width="7" height="10" rx="1.5" strokeWidth="1" className={leftFill} />
      <rect x="10.5" y="0.5" width="7" height="10" rx="1.5" strokeWidth="1" className={rightFill} />
    </svg>
  );
}

function layoutButtonLabel(current: Layout): string {
  switch (current) {
    case "chat":     return "Split";
    case "both":     return "Notebook only";
    case "notebook": return "Chat only";
  }
}

function IconGear() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export default function App() {
  const [layout, setLayout] = useState<Layout>("chat");
  const [showSettings, setShowSettings] = useState(false);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState<string | null>(null);
  const [hasTranscript, setHasTranscript] = useState(false);
  // True once the background has confirmed transcript status for the current video.
  // Prevents the "no captions" banner from flashing before extractFromTab finishes.
  const [transcriptKnown, setTranscriptKnown] = useState(false);
  const [isYoutube, setIsYoutube] = useState(false);
  const notebookRef = useRef<NotebookHandle>(null);
  // Set to true when VIDEO_STATE arrives. Prevents a slow GET_STATE response
  // from overwriting videoId/videoTitle that VIDEO_STATE already set correctly.
  const videoStateReceivedRef = useRef(false);

  // Load persisted layout state
  useEffect(() => {
    chrome.storage.local.get("layoutState", (result) => {
      if (result.layoutState) {
        setLayout(result.layoutState as Layout);
      }
    });
  }, []);

  // Request current video state from background on mount
  useEffect(() => {
    // 1. Immediately check the active tab — if it's YouTube, show the panel
    //    right away and seed videoId + videoTitle before extractFromTab completes.
    //    Also trigger EXTRACT_TAB so the background re-extracts transcript via
    //    world:"MAIN" (the content script can't do this from isolated world).
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      const url = tab?.url ?? "";
      if (url.includes("youtube.com")) {
        setIsYoutube(true);
        setTranscriptKnown(false); // wait for background to confirm
        try {
          const vid = new URL(url).searchParams.get("v");
          if (vid) setVideoId(vid);
        } catch { /* ignore */ }
        // Tab title is "Video Title - YouTube" — strip the suffix for an
        // immediate title before the background finishes extractFromTab.
        if (tab?.title) {
          const title = tab.title.replace(/ [-–] YouTube$/, "").trim();
          if (title) setVideoTitle(title);
        }
        // Ask background to (re-)extract transcript for this tab right now.
        // This handles the case where the sidebar opens on an already-loaded
        // YouTube tab that never triggered tabs.onUpdated (e.g. after SW restart).
        if (tab?.id) {
          console.log(`[app] mount: active tab url=${url} → sending EXTRACT_TAB tabId=${tab.id}`);
          chrome.runtime.sendMessage({ type: "EXTRACT_TAB", tabId: tab.id }).catch(() => {});
        }
      } else {
        console.log(`[app] mount: active tab not YouTube (url=${url})`);
      }
    });

    // 2. Get full persisted state from background (awaits restoreState internally).
    //    Only apply videoId/videoTitle if VIDEO_STATE hasn't arrived yet — VIDEO_STATE
    //    is authoritative and GET_STATE may carry stale data from a previous session.
    //    isYoutube is derived from tabs.query (above) or VIDEO_STATE, not from persisted
    //    state, because the background has no way to clear isYoutube when leaving YouTube.
    chrome.runtime.sendMessage({ type: "GET_STATE" }, (response) => {
      if (chrome.runtime.lastError || !response) return;
      console.log(`[app] GET_STATE response: videoId=${response.videoId} hasTranscript=${response.hasTranscript} (videoStateReceived=${videoStateReceivedRef.current}, ${videoStateReceivedRef.current ? "skipping stale" : "applying"})`);
      if (!videoStateReceivedRef.current) {
        if (response.videoId) setVideoId(response.videoId);
        if (response.videoTitle) setVideoTitle(response.videoTitle);
      }
      // Only trust hasTranscript=true from GET_STATE — false may be stale.
      // VIDEO_STATE (sent after extractFromTab completes) is the authoritative
      // source for both true and false, and always sets transcriptKnown=true.
      if (response.hasTranscript) {
        setHasTranscript(true);
        setTranscriptKnown(true);
      }
    });
  }, []);

  // Listen for open-settings event from ChatPanel's API key banner
  useEffect(() => {
    const handler = () => setShowSettings(true);
    window.addEventListener("open-settings", handler);
    return () => window.removeEventListener("open-settings", handler);
  }, []);

  // Listen for video state updates from background
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listener = (msg: any) => {
      if (msg.type === "VIDEO_STATE") {
        console.log(`[app] VIDEO_STATE: videoId=${msg.videoId} title="${msg.videoTitle}" hasTranscript=${msg.hasTranscript}`);
        videoStateReceivedRef.current = true;
        setVideoId(msg.videoId ?? null);
        setVideoTitle(msg.videoTitle ?? null);
        setHasTranscript(msg.hasTranscript ?? false);
        setIsYoutube(msg.videoId != null);
        // VIDEO_STATE is sent after extractFromTab completes — definitive answer
        setTranscriptKnown(true);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const cycleLayout = useCallback(() => {
    setLayout((prev) => {
      const next = nextLayout(prev);
      console.log(`[app] layout changed: ${prev} → ${next} (persisted)`);
      chrome.storage.local.set({ layoutState: next });
      return next;
    });
  }, []);

  // Auto-advance layout to include notebook when content is sent there
  const ensureNotebookVisible = useCallback(() => {
    setLayout((prev) => {
      if (prev === "chat") {
        chrome.storage.local.set({ layoutState: "both" });
        return "both";
      }
      return prev;
    });
  }, []);

  const handleCopyToNotebook = useCallback((text: string) => {
    notebookRef.current?.appendText(text);
    ensureNotebookVisible();
  }, [ensureNotebookVisible]);

  const handleCopyMarkdownToNotebook = useCallback((markdown: string) => {
    notebookRef.current?.appendMarkdown(markdown);
    ensureNotebookVisible();
  }, [ensureNotebookVisible]);

  // Controls that live in whichever panel header is "leading"
  const headerControls = (
    <div className="flex items-center gap-1">
      <button
        onClick={cycleLayout}
        title={`Switch to ${layoutButtonLabel(layout)} view`}
        className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
      >
        <IconLayoutDestination current={layout} />
        {layoutButtonLabel(layout)}
      </button>
      <button
        onClick={() => setShowSettings((v) => !v)}
        title="Settings"
        className={`p-1.5 rounded-lg transition-colors ${
          showSettings
            ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40"
            : "text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
        }`}
      >
        <IconGear />
      </button>
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* Settings overlay */}
      {showSettings && (
        <div className="flex-1 overflow-y-auto">
          <SettingsPanel onClose={() => setShowSettings(false)} />
        </div>
      )}

      {/* Main content */}
      {!showSettings && (
        <>
          {!isYoutube && (
            <div className="flex-1 flex flex-col">
              {/* Show controls even on non-YouTube pages so notebook is accessible */}
              <div className="flex items-center justify-between px-4 h-10 border-b border-gray-200 dark:border-gray-800 shrink-0">
                <span className="text-[11px] font-semibold tracking-widest uppercase text-gray-500 dark:text-gray-400">Notebook</span>
                {headerControls}
              </div>
              {layout === "notebook" || layout === "both" ? (
                <NotebookPanel ref={notebookRef} />
              ) : (
                <div className="flex-1 flex items-center justify-center p-8">
                  <p className="text-sm text-gray-400 dark:text-gray-500 text-center">
                    Open a YouTube video to start chatting.
                  </p>
                </div>
              )}
            </div>
          )}

          {isYoutube && (
            <>
              {/* No transcript banner — only after background confirms status */}
              {transcriptKnown && !hasTranscript && videoId && (
                <div className="mx-3 mt-2 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg shrink-0">
                  No captions available for this video — chat will work without transcript context.
                </div>
              )}
              <div className="flex flex-1 overflow-hidden">
                {/* Chat pane — carries the layout controls in its header */}
                {(layout === "chat" || layout === "both") && (
                  <div className={`flex flex-col overflow-hidden ${layout === "both" ? "flex-1" : "w-full"}`}>
                    <ChatPanel
                      videoId={videoId}
                      videoTitle={videoTitle}
                      hasTranscript={hasTranscript}
                      onCopyToNotebook={handleCopyToNotebook}
                      onCopyMarkdownToNotebook={handleCopyMarkdownToNotebook}
                      headerControls={headerControls}
                    />
                  </div>
                )}

                {layout === "both" && (
                  <div className="w-px bg-gray-200 dark:bg-gray-800 shrink-0" />
                )}

                {/* Notebook pane — carries controls only when chat is hidden */}
                {(layout === "both" || layout === "notebook") && (
                  <div className={`flex flex-col overflow-hidden ${layout === "both" ? "flex-1" : "w-full"}`}>
                    <NotebookPanel
                      ref={notebookRef}
                      headerControls={layout === "notebook" ? headerControls : undefined}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
