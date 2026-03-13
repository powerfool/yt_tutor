"use client";

import { useEffect, useState } from "react";

type Entry = {
  id: string;
  videoId: string;
  videoTitle: string;
  watchedAt: string;
};

type Props = {
  projectId: string;
  refreshKey: string | null;
};

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

export default function WatchHistoryPanel({ projectId, refreshKey }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/watch-history`)
      .then((r) => r.json())
      .then(setEntries)
      .catch(() => {});
  }, [projectId, refreshKey]);

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[13px] text-gray-400 dark:text-gray-600">
        No videos watched yet
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full px-2 py-2 space-y-0.5">
      {entries.map((entry) => (
        <a
          key={entry.id}
          href={`https://www.youtube.com/watch?v=${entry.videoId}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/60 group transition-colors"
        >
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-gray-700 dark:text-gray-300 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug">
              {entry.videoTitle}
            </p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 font-mono tabular-nums">
              {relativeTime(entry.watchedAt)}
            </p>
          </div>
          <span className="shrink-0 text-gray-300 dark:text-gray-600 group-hover:text-gray-400 dark:group-hover:text-gray-500 transition-colors text-xs">
            ↗
          </span>
        </a>
      ))}
    </div>
  );
}
