"use client";

import { useEffect, useRef, useState } from "react";
import { TranscriptSegment, Chapter } from "@/lib/youtube";
import { YTPlayer } from "@/lib/ytplayer";

type Props = {
  transcript: TranscriptSegment[];
  playerRef: React.MutableRefObject<YTPlayer | null>;
  chapters?: Chapter[];
  loading?: boolean;
  hasVideo?: boolean;
};

function formatTime(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatSec(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function SkeletonLines() {
  return (
    <div className="px-3 py-3 space-y-2 animate-pulse">
      {[70, 90, 55, 80, 65, 85, 50, 75].map((w, i) => (
        <div key={i} className="flex gap-2 items-start">
          <div className="shrink-0 h-3 w-10 rounded bg-gray-200 dark:bg-gray-700 mt-0.5" />
          <div className={`h-3 rounded bg-gray-200 dark:bg-gray-700`} style={{ width: `${w}%` }} />
        </div>
      ))}
    </div>
  );
}

export default function TranscriptPanel({ transcript, playerRef, chapters = [], loading = false, hasVideo = false }: Props) {
  const [currentTime, setCurrentTime] = useState(0);
  const activeSegRef = useRef<HTMLDivElement>(null);
  const activeChapterRef = useRef<HTMLButtonElement>(null);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  const userScrolledTranscriptRef = useRef(false);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Poll player time every second
  useEffect(() => {
    const interval = setInterval(() => {
      const t = (typeof playerRef.current?.getCurrentTime === "function" ? playerRef.current.getCurrentTime() : 0) * 1000;
      setCurrentTime(t);
    }, 1000);
    return () => clearInterval(interval);
  }, [playerRef]);

  // Active transcript segment index
  const activeSegIdx = transcript.reduce((best, seg, i) => {
    return seg.offset <= currentTime ? i : best;
  }, 0);

  // Active chapter index
  const activeChapterIdx = chapters.reduce((best, ch, i) => {
    return ch.startTimeSec * 1000 <= currentTime ? i : best;
  }, 0);

  // Auto-scroll transcript container to keep active segment in view
  useEffect(() => {
    if (userScrolledTranscriptRef.current) return;
    const container = transcriptScrollRef.current;
    const el = activeSegRef.current;
    if (!container || !el) return;
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const elTopRelative = elRect.top - containerRect.top;
    const containerH = container.clientHeight;
    if (elTopRelative < 0 || elTopRelative > containerH * 0.65) {
      container.scrollTo({
        top: container.scrollTop + elTopRelative - containerH * 0.25,
        behavior: "smooth",
      });
    }
  }, [activeSegIdx]);

  // Auto-scroll chapters to active chapter
  useEffect(() => {
    activeChapterRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeChapterIdx]);

  function handleTranscriptScroll() {
    userScrolledTranscriptRef.current = true;
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => {
      userScrolledTranscriptRef.current = false;
    }, 5000);
  }

  // Loading skeleton
  if (loading) {
    return (
      <div className="flex h-full overflow-hidden">
        {/* Chapters skeleton */}
        <div className="w-40 shrink-0 border-r border-gray-200 dark:border-gray-800 flex flex-col bg-gray-50 dark:bg-gray-900">
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800 shrink-0">
            <span className="text-[10px] font-semibold tracking-widest uppercase text-gray-500 dark:text-gray-400">Chapters</span>
          </div>
          <div className="px-3 py-3 space-y-3 animate-pulse">
            {[60, 80, 50, 70, 45].map((w, i) => (
              <div key={i} className="space-y-1">
                <div className="h-2 w-8 rounded bg-gray-200 dark:bg-gray-700" />
                <div className={`h-3 rounded bg-gray-200 dark:bg-gray-700`} style={{ width: `${w}%` }} />
              </div>
            ))}
          </div>
        </div>
        {/* Transcript skeleton */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <SkeletonLines />
        </div>
      </div>
    );
  }

  // No video loaded yet
  if (!hasVideo) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-[13px] text-gray-500 dark:text-gray-400">Load a video to see the transcript</p>
      </div>
    );
  }

  // Video loaded but no transcript
  if (transcript.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-[13px] text-gray-500 dark:text-gray-400">No transcript available</p>
      </div>
    );
  }

  const transcriptContent = (
    <div
      ref={transcriptScrollRef}
      className="overflow-y-auto flex-1 px-2 py-2 space-y-px"
      onScroll={handleTranscriptScroll}
    >
      {transcript.map((seg, i) => {
        const isActive = i === activeSegIdx;
        return (
          <div
            key={i}
            ref={isActive ? activeSegRef : undefined}
            onClick={() => playerRef.current?.seekTo(seg.offset / 1000, true)}
            className={`flex gap-2 rounded-lg px-2 py-1.5 transition-all select-text cursor-pointer border-l-2 ${
              isActive
                ? "border-blue-500 bg-blue-50 dark:bg-blue-950/60 text-gray-900 dark:text-gray-100"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/60 hover:text-gray-800 dark:hover:text-gray-200"
            }`}
          >
            <span className="shrink-0 text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 w-14 text-right font-mono tabular-nums">
              {formatTime(seg.offset)}
            </span>
            <span className="text-[13px] leading-snug">{seg.text}</span>
          </div>
        );
      })}
    </div>
  );

  // Two-column layout when chapters are available
  if (chapters.length > 0) {
    return (
      <div className="flex h-full overflow-hidden">
        {/* Left: Chapters */}
        <div className="w-40 shrink-0 border-r border-gray-200 dark:border-gray-800 flex flex-col bg-gray-50 dark:bg-gray-900">
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800 shrink-0">
            <span className="text-[10px] font-semibold tracking-widest uppercase text-gray-500 dark:text-gray-400">
              Chapters
            </span>
          </div>
          <div className="overflow-y-auto flex-1 py-1">
            {chapters.map((chapter, i) => {
              const isActive = i === activeChapterIdx;
              return (
                <button
                  key={i}
                  ref={isActive ? activeChapterRef : undefined}
                  onClick={() => playerRef.current?.seekTo(chapter.startTimeSec, true)}
                  className={`w-full text-left px-3 py-2.5 transition-colors border-l-2 ${
                    isActive
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-200"
                      : "border-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/60 hover:text-gray-800 dark:hover:text-gray-200"
                  }`}
                >
                  <div className={`text-[10px] font-mono mb-0.5 tabular-nums ${isActive ? "text-blue-500 dark:text-blue-400" : "text-gray-400 dark:text-gray-500"}`}>
                    {formatSec(chapter.startTimeSec)}
                  </div>
                  <div className="text-[12px] leading-snug font-medium">
                    {chapter.title}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Transcript */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {transcriptContent}
        </div>
      </div>
    );
  }

  // Single-column layout (no chapters)
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {transcriptContent}
    </div>
  );
}
