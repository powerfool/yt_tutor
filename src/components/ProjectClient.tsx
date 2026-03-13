"use client";

import { useRef, useState } from "react";
import VideoPanel from "@/components/VideoPanel";
import ChatPanel from "@/components/ChatPanel";
import NotebookPanel, { NotebookHandle } from "@/components/NotebookPanel";
import TranscriptPanel from "@/components/TranscriptPanel";
import { TranscriptSegment, Chapter } from "@/lib/youtube";

type YTPlayer = { getCurrentTime: () => number; seekTo: (s: number, a: boolean) => void; destroy: () => void };

type Props = { projectId: string; initialVideoId: string | null };

export default function ProjectClient({ projectId, initialVideoId }: Props) {
  const playerRef = useRef<YTPlayer | null>(null);
  const notebookRef = useRef<NotebookHandle | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptSegment[] | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [chapters, setChapters] = useState<Chapter[]>([]);

  function handleVideoLoad(
    id: string,
    title: string,
    segments: TranscriptSegment[] | null,
    savedChapters: Chapter[] | null
  ) {
    setVideoId(id);
    setVideoTitle(title);
    setTranscript(segments);
    setChapters(savedChapters && savedChapters.length > 0 ? savedChapters : []);
    setTranscriptOpen(!!segments && segments.length > 0);
  }

  function handleChaptersGenerated(newChapters: Chapter[]) {
    setChapters(newChapters);
    // Persist generated chapters to watch history
    if (videoId) {
      fetch(`/api/projects/${projectId}/watch-history`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, chapters: newChapters }),
      });
    }
  }

  const hasTranscript = !!transcript && transcript.length > 0;

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left: Video + transcript */}
      <div className="flex flex-col w-[40%] border-r border-gray-200 dark:border-gray-800">
        {/* Video */}
        <div className={transcriptOpen ? "h-[55%]" : "flex-1"}>
          <VideoPanel
            projectId={projectId}
            initialVideoId={initialVideoId}
            onVideoLoad={handleVideoLoad}
            playerRef={playerRef}
          />
        </div>

        {/* Transcript tab */}
        <div className="shrink-0 flex items-end border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
          <button
            onClick={() => setTranscriptOpen((v) => !v)}
            disabled={!hasTranscript}
            title={!hasTranscript && !!videoId ? "Transcript unavailable" : undefined}
            style={{ marginBottom: "-1px" }}
            className={`px-4 py-2 text-[11px] font-medium tracking-widest uppercase border-b-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
              transcriptOpen
                ? "border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-gray-950"
                : "border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            Transcript
          </button>
        </div>

        {/* Transcript panel */}
        {transcriptOpen && hasTranscript && (
          <div className="flex-1 overflow-hidden border-t border-gray-200 dark:border-gray-800">
            <TranscriptPanel
              transcript={transcript!}
              playerRef={playerRef}
              chapters={chapters}
            />
          </div>
        )}
      </div>

      {/* Center: Chat */}
      <div className="flex flex-col w-[35%] border-r border-gray-200 dark:border-gray-800">
        <ChatPanel
          projectId={projectId}
          videoId={videoId}
          videoTitle={videoTitle}
          transcript={transcript}
          playerRef={playerRef}
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
