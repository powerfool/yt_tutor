"use client";

import { useEffect, useRef, useState } from "react";
import { TranscriptSegment } from "@/lib/youtube";

type YTPlayer = { getCurrentTime: () => number; seekTo: (seconds: number, allowSeekAhead: boolean) => void };

type Props = {
  transcript: TranscriptSegment[];
  playerRef: React.MutableRefObject<YTPlayer | null>;
};

function formatTime(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function TranscriptPanel({ transcript, playerRef }: Props) {
  const [currentTime, setCurrentTime] = useState(0);
  const activeRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Poll player time every second
  useEffect(() => {
    const interval = setInterval(() => {
      const t = (playerRef.current?.getCurrentTime() ?? 0) * 1000; // convert to ms
      setCurrentTime(t);
    }, 1000);
    return () => clearInterval(interval);
  }, [playerRef]);

  // Find the active segment index (last segment whose offset <= currentTime)
  const activeIdx = transcript.reduce((best, seg, i) => {
    return seg.offset <= currentTime ? i : best;
  }, 0);

  // Auto-scroll to active segment, unless user is manually scrolling
  useEffect(() => {
    if (userScrolledRef.current) return;
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeIdx]);

  function handleScroll() {
    userScrolledRef.current = true;
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    // Resume auto-scroll 5s after last manual scroll
    scrollTimerRef.current = setTimeout(() => {
      userScrolledRef.current = false;
    }, 5000);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div
        className="overflow-y-auto flex-1 px-2 py-2 space-y-0.5"
        onScroll={handleScroll}
      >
        {transcript.map((seg, i) => {
          const isActive = i === activeIdx;
          return (
            <div
              key={i}
              ref={isActive ? activeRef : undefined}
              onClick={() => playerRef.current?.seekTo(seg.offset / 1000, true)}
              className={`flex gap-2 rounded px-1.5 py-1 transition-colors select-text cursor-pointer ${
                isActive
                  ? "bg-yellow-100 dark:bg-yellow-900/40 text-gray-900 dark:text-gray-100"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500 mt-0.5 w-8 text-right font-mono">
                {formatTime(seg.offset)}
              </span>
              <span className="text-sm leading-snug">{seg.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
