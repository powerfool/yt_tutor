"use client";

import { useEffect, useRef, useState } from "react";
import { parseVideoId, TranscriptSegment } from "@/lib/youtube";

// Minimal type for the YouTube IFrame Player API
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
  destroy: () => void;
};

type Props = {
  projectId: string;
  onVideoLoad: (videoId: string, title: string, transcript: TranscriptSegment[] | null) => void;
  playerRef: React.MutableRefObject<YTPlayer | null>;
};

export default function VideoPanel({ projectId, onVideoLoad, playerRef }: Props) {
  const [urlInput, setUrlInput] = useState("");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef = useRef<YTPlayer | null>(null);

  // Load YouTube IFrame API once
  useEffect(() => {
    if (document.getElementById("yt-iframe-api")) return;
    const tag = document.createElement("script");
    tag.id = "yt-iframe-api";
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  }, []);

  // Create player when videoId changes
  useEffect(() => {
    if (!videoId || !playerContainerRef.current) return;

    const createPlayer = () => {
      if (ytPlayerRef.current) ytPlayerRef.current.destroy();
      const player = new window.YT.Player(playerContainerRef.current!, {
        videoId,
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: (e) => {
            ytPlayerRef.current = e.target;
            playerRef.current = e.target;
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

    return () => {
      // cleanup handled on next video load
    };
  }, [videoId, playerRef]);

  async function handleLoad() {
    const id = parseVideoId(urlInput);
    if (!id) {
      setError("Couldn't parse a YouTube video ID from that URL.");
      return;
    }

    setError("");
    setLoading(true);
    setVideoId(id);

    try {
      const res = await fetch(`/api/youtube/${id}`);
      const { title, transcript } = await res.json();

      await fetch(`/api/projects/${projectId}/watch-history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: id, videoTitle: title }),
      });

      onVideoLoad(id, title, transcript);
    } catch {
      setError("Failed to load video info. The video will still play.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* URL bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
        <input
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLoad()}
          placeholder="Paste a YouTube URL…"
          className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleLoad}
          disabled={loading || !urlInput.trim()}
          className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
        >
          {loading ? "Loading…" : "Load"}
        </button>
      </div>

      {error && (
        <p className="px-3 py-1 text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950">
          {error}
        </p>
      )}

      {/* Player */}
      <div className="flex-1 bg-black relative">
        {!videoId && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">
            Paste a YouTube URL above to start watching
          </div>
        )}
        <div ref={playerContainerRef} className="w-full h-full" />
      </div>
    </div>
  );
}
