"use client";

import { useRef, useState } from "react";
import VideoPanel from "@/components/VideoPanel";
import ChatPanel from "@/components/ChatPanel";
import NotebookPanel, { NotebookHandle } from "@/components/NotebookPanel";
import TranscriptPanel from "@/components/TranscriptPanel";
import { TranscriptSegment, Chapter } from "@/lib/youtube";
import { YTPlayer } from "@/lib/ytplayer";

type Props = { projectId: string; initialVideoId: string | null };

export default function ProjectClient({ projectId, initialVideoId }: Props) {
  const playerRef = useRef<YTPlayer | null>(null);
  const notebookRef = useRef<NotebookHandle | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptSegment[] | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [videoLoading, setVideoLoading] = useState(false);

  function handleVideoLoadStart() {
    setVideoLoading(true);
    setTranscript(null);
    setChapters([]);
    setVideoTitle(null);
  }

  function handleVideoLoad(
    id: string,
    title: string,
    segments: TranscriptSegment[] | null,
    savedChapters: Chapter[] | null
  ) {
    setVideoLoading(false);
    setVideoId(id);
    setVideoTitle(title);
    setTranscript(segments);
    setChapters(savedChapters && savedChapters.length > 0 ? savedChapters : []);
  }

  function handleChaptersGenerated(newChapters: Chapter[]) {
    setChapters(newChapters);
    if (videoId) {
      fetch(`/api/projects/${projectId}/watch-history`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, chapters: newChapters }),
      });
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left: Video + transcript (always visible) */}
      <div className="flex flex-col w-[40%] border-r border-gray-200 dark:border-gray-800">
        {/* Video — fixed height */}
        <div className="h-[55%] shrink-0">
          <VideoPanel
            projectId={projectId}
            initialVideoId={initialVideoId}
            onVideoLoadStart={handleVideoLoadStart}
            onVideoLoad={handleVideoLoad}
            playerRef={playerRef}
          />
        </div>

        {/* Transcript — always visible */}
        <div className="flex-1 overflow-hidden border-t border-gray-200 dark:border-gray-800">
          <TranscriptPanel
            transcript={transcript ?? []}
            playerRef={playerRef}
            chapters={chapters}
            loading={videoLoading}
            hasVideo={!!videoId || videoLoading}
          />
        </div>
      </div>

      {/* Center: Chat */}
      <div className="flex flex-col w-[35%] border-r border-gray-200 dark:border-gray-800">
        <ChatPanel
          projectId={projectId}
          videoId={videoId}
          videoTitle={videoTitle}
          transcript={transcript}
          playerRef={playerRef}
          videoLoading={videoLoading}
          onCopyToNotebook={(text) => notebookRef.current?.appendText(text)}
          onCopyMarkdownToNotebook={(md) => notebookRef.current?.appendMarkdown(md)}
          onChaptersGenerated={handleChaptersGenerated}
          chapters={chapters}
        />
      </div>

      {/* Right: Notebook */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <NotebookPanel ref={notebookRef} projectId={projectId} />
      </div>
    </div>
  );
}
