"use client";

import { useRef, useState } from "react";
import VideoPanel from "@/components/VideoPanel";
import ChatPanel from "@/components/ChatPanel";
import NotebookPanel, { NotebookHandle } from "@/components/NotebookPanel";
import TranscriptPanel from "@/components/TranscriptPanel";
import WatchHistoryPanel from "@/components/WatchHistoryPanel";
import { TranscriptSegment } from "@/lib/youtube";

type YTPlayer = { getCurrentTime: () => number; seekTo: (s: number, a: boolean) => void; destroy: () => void };
type BottomPanel = "transcript" | "history" | null;

type Props = { projectId: string; initialVideoId: string | null };

export default function ProjectClient({ projectId, initialVideoId }: Props) {
  const playerRef = useRef<YTPlayer | null>(null);
  const notebookRef = useRef<NotebookHandle | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptSegment[] | null>(null);
  const [bottomPanel, setBottomPanel] = useState<BottomPanel>(null);

  function handleVideoLoad(
    id: string,
    title: string,
    segments: TranscriptSegment[] | null
  ) {
    setVideoId(id);
    setVideoTitle(title);
    setTranscript(segments);
    // Auto-open transcript if available, otherwise history
    setBottomPanel(segments && segments.length > 0 ? "transcript" : "history");
  }

  function togglePanel(panel: "transcript" | "history") {
    setBottomPanel((prev) => (prev === panel ? null : panel));
  }

  const hasTranscript = !!transcript && transcript.length > 0;

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left: Video + bottom panel */}
      <div className="flex flex-col w-[40%] border-r border-gray-200 dark:border-gray-800">
        {/* Video */}
        <div className={bottomPanel ? "h-[55%]" : "flex-1"}>
          <VideoPanel
            projectId={projectId}
            initialVideoId={initialVideoId}
            onVideoLoad={handleVideoLoad}
            playerRef={playerRef}
          />
        </div>

        {/* Tab strip */}
        <div className="shrink-0 flex border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
          <TabButton
            active={bottomPanel === "transcript"}
            disabled={!hasTranscript}
            onClick={() => togglePanel("transcript")}
            title={!hasTranscript && !!videoId ? "Transcript unavailable" : undefined}
          >
            Transcript
          </TabButton>
          <TabButton
            active={bottomPanel === "history"}
            onClick={() => togglePanel("history")}
          >
            History
          </TabButton>
        </div>

        {/* Bottom panel */}
        {bottomPanel && (
          <div className="flex-1 overflow-hidden border-t border-gray-200 dark:border-gray-800">
            {bottomPanel === "transcript" && hasTranscript && (
              <TranscriptPanel transcript={transcript!} playerRef={playerRef} />
            )}
            {bottomPanel === "history" && (
              <WatchHistoryPanel projectId={projectId} refreshKey={videoId} />
            )}
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
        />
      </div>

      {/* Right: Notebook */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <NotebookPanel ref={notebookRef} projectId={projectId} />
      </div>
    </div>
  );
}

function TabButton({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex-1 text-xs px-3 py-1.5 border-b-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        active
          ? "border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-gray-950"
          : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
      }`}
    >
      {children}
    </button>
  );
}
