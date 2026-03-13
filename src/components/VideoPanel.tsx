"use client";

import { useEffect, useRef, useState } from "react";
import { parseVideoId, TranscriptSegment, Chapter } from "@/lib/youtube";

declare global {
  interface Window {
    YT: {
      Player: new (
        el: HTMLElement,
        opts: {
          videoId: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: (e: { target: YTPlayer }) => void;
            onStateChange?: (e: { data: number }) => void;
          };
        }
      ) => YTPlayer;
      loaded: number;
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

type YTPlayer = {
  getCurrentTime: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  destroy: () => void;
};

type HistoryEntry = {
  id: string;
  videoId: string;
  videoTitle: string;
  watchedAt: string;
};

type Props = {
  projectId: string;
  initialVideoId: string | null;
  onVideoLoad: (videoId: string, title: string, transcript: TranscriptSegment[] | null, savedChapters: Chapter[] | null) => void;
  playerRef: React.MutableRefObject<YTPlayer | null>;
};

function tsKey(projectId: string) {
  return `yt_tutor_ts_${projectId}`;
}

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function VideoPanel({ projectId, initialVideoId, onVideoLoad, playerRef }: Props) {
  const [urlInput, setUrlInput] = useState("");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef = useRef<YTPlayer | null>(null);
  const tsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const shouldAutoplayRef = useRef(false);
  const historyDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (document.getElementById("yt-iframe-api")) return;
    const tag = document.createElement("script");
    tag.id = "yt-iframe-api";
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  }, []);

  useEffect(() => {
    if (!initialVideoId) return;
    const saved = localStorage.getItem(tsKey(projectId));
    pendingSeekRef.current = saved ? parseFloat(saved) : 0;
    shouldAutoplayRef.current = false;
    loadVideoById(initialVideoId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!videoId || !playerContainerRef.current) return;

    const createPlayer = () => {
      if (ytPlayerRef.current) ytPlayerRef.current.destroy();
      const player = new window.YT.Player(playerContainerRef.current!, {
        videoId,
        playerVars: { autoplay: shouldAutoplayRef.current ? 1 : 0, rel: 0, modestbranding: 1 },
        events: {
          onReady: (e) => {
            ytPlayerRef.current = e.target;
            playerRef.current = e.target;
            if (pendingSeekRef.current !== null && pendingSeekRef.current > 0) {
              e.target.seekTo(pendingSeekRef.current, true);
            }
            pendingSeekRef.current = null;
            startTimestampSave();
          },
        },
      });
      ytPlayerRef.current = player;
      playerRef.current = player;
    };

    if (window.YT?.loaded) {
      createPlayer();
    } else {
      window.onYouTubeIframeAPIReady = createPlayer;
    }

    return () => {};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, playerRef]);

  function startTimestampSave() {
    if (tsIntervalRef.current) clearInterval(tsIntervalRef.current);
    tsIntervalRef.current = setInterval(() => {
      const player = ytPlayerRef.current;
      if (!player) return;
      try {
        const t = player.getCurrentTime();
        localStorage.setItem(tsKey(projectId), String(t));
      } catch {
        // ignore
      }
    }, 5000);
  }

  useEffect(() => {
    return () => {
      if (tsIntervalRef.current) clearInterval(tsIntervalRef.current);
    };
  }, []);

  // Close history dropdown when clicking outside
  useEffect(() => {
    if (!historyOpen) return;
    function handleClick(e: MouseEvent) {
      if (historyDropdownRef.current && !historyDropdownRef.current.contains(e.target as Node)) {
        setHistoryOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [historyOpen]);

  async function fetchHistory() {
    const res = await fetch(`/api/projects/${projectId}/watch-history`);
    const data = await res.json().catch(() => []);
    setHistory(Array.isArray(data) ? data : []);
    setHistoryLoaded(true);
  }

  function toggleHistory() {
    if (!historyOpen && !historyLoaded) {
      fetchHistory();
    }
    setHistoryOpen((v) => !v);
  }

  async function loadVideoById(id: string) {
    setError("");
    setLoading(true);
    setVideoId(id);

    try {
      const res = await fetch(`/api/youtube/${id}`);
      const { title, transcript } = await res.json();

      const historyRes = await fetch(`/api/projects/${projectId}/watch-history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: id, videoTitle: title }),
      });
      const historyEntry = historyRes.ok ? await historyRes.json() : null;
      const savedChapters: Chapter[] | null =
        historyEntry?.chaptersJson ? JSON.parse(historyEntry.chaptersJson) : null;

      fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentVideoId: id }),
      });

      onVideoLoad(id, title, transcript, savedChapters);

      // Refresh history silently if it was ever loaded
      if (historyLoaded) fetchHistory();
    } catch {
      setError("Failed to load video info. The video will still play.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLoad() {
    const id = parseVideoId(urlInput);
    if (!id) {
      setError("Couldn't parse a YouTube video ID from that URL.");
      return;
    }
    localStorage.removeItem(tsKey(projectId));
    pendingSeekRef.current = null;
    shouldAutoplayRef.current = true;
    await loadVideoById(id);
  }

  return (
    <div className="flex flex-col h-full">
      {/* URL bar */}
      <div className="relative" ref={historyDropdownRef}>
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
          {/* History button */}
          <button
            onClick={toggleHistory}
            title="Watch history"
            className={`shrink-0 flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
              historyOpen
                ? "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="8" r="6.5" />
              <path d="M8 5v3.5l2 1.5" />
            </svg>
          </button>

          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLoad()}
            placeholder="Paste a YouTube URL…"
            className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 transition-colors"
          />
          <button
            onClick={handleLoad}
            disabled={loading || !urlInput.trim()}
            className="px-3 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors shrink-0"
          >
            {loading ? "Loading…" : "Load"}
          </button>
        </div>

        {/* History dropdown */}
        {historyOpen && (
          <div className="absolute inset-x-0 top-full z-50 bg-white dark:bg-gray-900 border border-t-0 border-gray-200 dark:border-gray-800 shadow-xl rounded-b-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
              <span className="text-[11px] font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">
                Recent videos
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {!historyLoaded ? (
                <p className="text-[13px] text-gray-400 dark:text-gray-500 text-center py-6">Loading…</p>
              ) : history.length === 0 ? (
                <p className="text-[13px] text-gray-400 dark:text-gray-500 text-center py-6">No videos watched yet</p>
              ) : (
                <div className="py-1">
                  {history.map((entry) => (
                    <a
                      key={entry.id}
                      href={`https://www.youtube.com/watch?v=${entry.videoId}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setHistoryOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 group transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] text-gray-700 dark:text-gray-300 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug">
                          {entry.videoTitle}
                        </p>
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 font-mono tabular-nums">
                          {relativeTime(entry.watchedAt)}
                        </p>
                      </div>
                      <span className="shrink-0 text-gray-300 dark:text-gray-600 group-hover:text-gray-400 dark:group-hover:text-gray-500 text-xs transition-colors">↗</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="px-3 py-1.5 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900/40">
          {error}
        </p>
      )}

      {/* Player */}
      <div className="flex-1 bg-black relative">
        {!videoId && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-600 dark:text-gray-500">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" opacity="0.4">
              <circle cx="18" cy="18" r="16.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
              <path d="M15 12.5l9 5.5-9 5.5V12.5z" fill="currentColor" />
            </svg>
            <span className="text-xs text-gray-400 dark:text-gray-600">Paste a YouTube URL above</span>
          </div>
        )}
        <div ref={playerContainerRef} className="w-full h-full" />
      </div>
    </div>
  );
}
