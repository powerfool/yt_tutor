"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import ChatPanel, { ChatPanelHandle } from "../components/ChatPanel";
import NotebookPanel, { NotebookHandle } from "../components/NotebookPanel";
import SettingsPanel from "../components/SettingsPanel";

type Layout = "chat" | "both" | "notebook";
type PageMode = "youtube" | "webpage" | "none";
type WebpageContext = { url: string; title: string; markdownContent: string | null };

const LAYOUT_CYCLE: Layout[] = ["chat", "both", "notebook"];

function nextLayout(current: Layout): Layout {
  const idx = LAYOUT_CYCLE.indexOf(current);
  return LAYOUT_CYCLE[(idx + 1) % LAYOUT_CYCLE.length];
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return url;
  }
}

function IconLayoutDestination({ current }: { current: Layout }) {
  const bothFilled = "fill-current";
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

function WebpageContextBanner({ ctx }: { ctx: WebpageContext }) {
  const displayTitle = ctx.title || "Untitled page";
  let displayUrl = "";
  try {
    const u = new URL(ctx.url);
    displayUrl = u.hostname + (u.pathname !== "/" ? u.pathname : "");
  } catch {
    displayUrl = ctx.url;
  }
  return (
    <div className="mx-3 mt-2 px-3 py-2 text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-lg shrink-0 min-w-0">
      <div className="font-medium truncate">{displayTitle}</div>
      <div className="text-blue-500 dark:text-blue-400 truncate">{displayUrl}</div>
    </div>
  );
}

export default function App() {
  const [layout, setLayout] = useState<Layout>("chat");
  const [showSettings, setShowSettings] = useState(false);
  const [pageMode, setPageMode] = useState<PageMode>("none");
  const [webpageContext, setWebpageContext] = useState<WebpageContext | null>(null);
  const [pendingPrefill, setPendingPrefill] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState<string | null>(null);
  const [hasTranscript, setHasTranscript] = useState(false);
  const [transcriptKnown, setTranscriptKnown] = useState(false);
  const notebookRef = useRef<NotebookHandle>(null);
  const chatPanelRef = useRef<ChatPanelHandle>(null);
  // Set to true when VIDEO_STATE or WEBPAGE_STATE arrives.
  const stateReceivedRef = useRef(false);

  const isYoutube = pageMode === "youtube";

  // Load persisted layout state
  useEffect(() => {
    chrome.storage.local.get("layoutState", (result) => {
      if (result.layoutState) {
        setLayout(result.layoutState as Layout);
      }
    });
  }, []);

  // Request current state from background on mount
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      const url = tab?.url ?? "";

      if (url.includes("youtube.com")) {
        setPageMode("youtube");
        setTranscriptKnown(false);
        try {
          const vid = new URL(url).searchParams.get("v");
          if (vid) setVideoId(vid);
        } catch { /* ignore */ }
        if (tab?.title) {
          const title = tab.title.replace(/ [-–] YouTube$/, "").trim();
          if (title) setVideoTitle(title);
        }
        if (tab?.id) {
          console.log(`[app] mount: active tab url=${url} → sending EXTRACT_TAB tabId=${tab.id}`);
          chrome.runtime.sendMessage({ type: "EXTRACT_TAB", tabId: tab.id }).catch(() => {});
        }
      } else if (url.startsWith("http://") || url.startsWith("https://")) {
        setPageMode("webpage");
        setWebpageContext({ url, title: tab?.title ?? "", markdownContent: null });
        console.log(`[app] mount: active tab is webpage url=${url}`);
      } else {
        console.log(`[app] mount: active tab is neither YouTube nor webpage (url=${url})`);
      }
    });

    chrome.runtime.sendMessage({ type: "GET_STATE" }, (response) => {
      if (chrome.runtime.lastError || !response) return;
      console.log(`[app] GET_STATE response: mode=${response.mode} videoId=${response.videoId} hasTranscript=${response.hasTranscript} (stateReceived=${stateReceivedRef.current})`);
      if (!stateReceivedRef.current) {
        if (response.videoId) setVideoId(response.videoId);
        if (response.videoTitle) setVideoTitle(response.videoTitle);
        if (response.mode === "webpage" && response.webpageContext) {
          setPageMode("webpage");
          setWebpageContext(response.webpageContext);
        }
      }
      if (response.pendingPrefill) {
        setPendingPrefill(response.pendingPrefill);
      }
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

  // Listen for state updates from background
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listener = (msg: any) => {
      if (msg.type === "VIDEO_STATE") {
        console.log(`[app] VIDEO_STATE: videoId=${msg.videoId} title="${msg.videoTitle}" hasTranscript=${msg.hasTranscript}`);
        stateReceivedRef.current = true;
        setVideoId(msg.videoId ?? null);
        setVideoTitle(msg.videoTitle ?? null);
        setHasTranscript(msg.hasTranscript ?? false);
        setPageMode(msg.videoId != null ? "youtube" : "none");
        setWebpageContext(null);
        setTranscriptKnown(true);
      }

      if (msg.type === "WEBPAGE_STATE") {
        console.log(`[app] WEBPAGE_STATE: url=${msg.webpageContext?.url}`);
        stateReceivedRef.current = true;
        setPageMode("webpage");
        setWebpageContext(msg.webpageContext ?? null);
        setVideoId(null);
        setVideoTitle(null);
        setHasTranscript(false);
      }

      if (msg.type === "CLEAR_STATE") {
        console.log("[app] CLEAR_STATE");
        stateReceivedRef.current = true;
        setPageMode("none");
        setVideoId(null);
        setVideoTitle(null);
        setHasTranscript(false);
        setWebpageContext(null);
      }

      if (msg.type === "PREFILL_INPUT") {
        console.log(`[app] PREFILL_INPUT len=${msg.selectedText?.length}`);
        chatPanelRef.current?.prefillQuote(msg.selectedText ?? "");
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const cycleLayout = useCallback(() => {
    setLayout((prev) => {
      const next = nextLayout(prev);
      chrome.storage.local.set({ layoutState: next });
      return next;
    });
  }, []);

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

  // contextId: the stable identifier for the current chat context
  const contextId = pageMode === "youtube"
    ? videoId
    : pageMode === "webpage" && webpageContext
      ? normalizeUrl(webpageContext.url)
      : null;

  // Apply pendingPrefill once contextId (and therefore ChatPanel) is ready
  useEffect(() => {
    if (!contextId || !pendingPrefill) return;
    chatPanelRef.current?.prefillQuote(pendingPrefill);
    setPendingPrefill(null);
  }, [contextId, pendingPrefill]);

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
          {/* No context (new tab, chrome://, etc.) */}
          {pageMode === "none" && (
            <div className="flex-1 flex flex-col">
              <div className="flex items-center justify-between px-4 h-10 border-b border-gray-200 dark:border-gray-800 shrink-0">
                <span className="text-[11px] font-semibold tracking-widest uppercase text-gray-500 dark:text-gray-400">Notebook</span>
                {headerControls}
              </div>
              {layout === "notebook" || layout === "both" ? (
                <NotebookPanel ref={notebookRef} />
              ) : (
                <div className="flex-1 flex items-center justify-center p-8">
                  <p className="text-sm text-gray-400 dark:text-gray-500 text-center">
                    Open a YouTube video or any webpage to start chatting.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* YouTube mode */}
          {isYoutube && (
            <>
              {transcriptKnown && !hasTranscript && videoId && (
                <div className="mx-3 mt-2 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg shrink-0">
                  No captions available for this video — chat will work without transcript context.
                </div>
              )}
              <div className="flex flex-1 overflow-hidden">
                {(layout === "chat" || layout === "both") && (
                  <div className={`flex flex-col overflow-hidden ${layout === "both" ? "flex-1" : "w-full"}`}>
                    <ChatPanel
                      ref={chatPanelRef}
                      videoId={videoId}
                      videoTitle={videoTitle}
                      hasTranscript={hasTranscript}
                      onCopyToNotebook={handleCopyToNotebook}
                      onCopyMarkdownToNotebook={handleCopyMarkdownToNotebook}
                      headerControls={headerControls}
                      mode="youtube"
                      contextId={contextId}
                    />
                  </div>
                )}
                {layout === "both" && (
                  <div className="w-px bg-gray-200 dark:bg-gray-800 shrink-0" />
                )}
                <div className={`flex flex-col overflow-hidden ${layout === "both" ? "flex-1" : "w-full"} ${layout === "chat" ? "hidden" : ""}`}>
                  <NotebookPanel
                    ref={notebookRef}
                    headerControls={layout === "notebook" ? headerControls : undefined}
                  />
                </div>
              </div>
            </>
          )}

          {/* Webpage mode */}
          {pageMode === "webpage" && (
            <>
              {webpageContext && <WebpageContextBanner ctx={webpageContext} />}
              <div className="flex flex-1 overflow-hidden">
                {(layout === "chat" || layout === "both") && (
                  <div className={`flex flex-col overflow-hidden ${layout === "both" ? "flex-1" : "w-full"}`}>
                    <ChatPanel
                      ref={chatPanelRef}
                      videoId={null}
                      videoTitle={null}
                      hasTranscript={false}
                      onCopyToNotebook={handleCopyToNotebook}
                      onCopyMarkdownToNotebook={handleCopyMarkdownToNotebook}
                      headerControls={headerControls}
                      mode="webpage"
                      webpageContext={webpageContext}
                      contextId={contextId}
                    />
                  </div>
                )}
                {layout === "both" && (
                  <div className="w-px bg-gray-200 dark:bg-gray-800 shrink-0" />
                )}
                <div className={`flex flex-col overflow-hidden ${layout === "both" ? "flex-1" : "w-full"} ${layout === "chat" ? "hidden" : ""}`}>
                  <NotebookPanel
                    ref={notebookRef}
                    headerControls={layout === "notebook" ? headerControls : undefined}
                  />
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
