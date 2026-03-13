"use client";

import { useRef, useState } from "react";
import VideoPanel from "@/components/VideoPanel";
import ChatPanel from "@/components/ChatPanel";
import { TranscriptSegment } from "@/lib/youtube";

type YTPlayer = { getCurrentTime: () => number; destroy: () => void };

type Props = { projectId: string };

export default function ProjectClient({ projectId }: Props) {
  const playerRef = useRef<YTPlayer | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptSegment[] | null>(null);

  function handleVideoLoad(
    id: string,
    title: string,
    segments: TranscriptSegment[] | null
  ) {
    setVideoId(id);
    setVideoTitle(title);
    setTranscript(segments);
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left: Video */}
      <div className="flex flex-col w-[40%] border-r border-gray-200 dark:border-gray-800">
        <VideoPanel
          projectId={projectId}
          onVideoLoad={handleVideoLoad}
          playerRef={playerRef}
        />
      </div>

      {/* Center: Chat */}
      <div className="flex flex-col w-[35%] border-r border-gray-200 dark:border-gray-800">
        <ChatPanel
          projectId={projectId}
          videoId={videoId}
          videoTitle={videoTitle}
          transcript={transcript}
        />
      </div>

      {/* Right: Notebook */}
      <div className="flex flex-col flex-1">
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Notebook
        </div>
      </div>
    </div>
  );
}
