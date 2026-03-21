export type YTPlayer = {
  getCurrentTime: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  cueVideoById: (opts: { videoId: string; startSeconds?: number }) => void;
  pauseVideo: () => void;
  destroy: () => void;
};
