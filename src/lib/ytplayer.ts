export type YTPlayer = {
  getCurrentTime: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  pauseVideo: () => void;
  destroy: () => void;
};
