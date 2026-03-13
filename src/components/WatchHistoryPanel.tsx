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
  refreshKey: string | null; // pass current videoId so list refreshes on new load
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
      <div className="flex items-center justify-center h-full text-sm text-gray-400 dark:text-gray-600">
        No videos watched yet
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full px-2 py-2 space-y-1">
      {entries.map((entry) => (
        <a
          key={entry.id}
          href={`https://www.youtube.com/watch?v=${entry.videoId}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-start gap-2 rounded px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 group"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm text-gray-800 dark:text-gray-200 truncate group-hover:underline leading-snug">
              {entry.videoTitle}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {relativeTime(entry.watchedAt)}
            </p>
          </div>
        </a>
      ))}
    </div>
  );
}
