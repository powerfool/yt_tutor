// Server-only — in-memory cache for video transcripts and titles.
// Populated by /api/youtube/[videoId] so the chat routes can re-use
// the already-fetched data without a second round-trip to YouTube.
import { fetchTranscript, fetchVideoInfo } from "./youtube.server";
import type { TranscriptSegment } from "./youtube";

type CacheEntry = {
  transcript: TranscriptSegment[] | null;
  title: string;
  fetchedAt: number;
};

const cache = new Map<string, CacheEntry>();
const TTL_MS = 60 * 60 * 1000; // 1 hour

/** Called by /api/youtube/[videoId] after it fetches video data, so subsequent
 *  chat requests can skip the YouTube round-trip entirely. */
export function populateCache(
  videoId: string,
  title: string,
  transcript: TranscriptSegment[] | null
): void {
  cache.set(videoId, { transcript, title, fetchedAt: Date.now() });
}

/** Returns cached data if fresh; otherwise fetches from YouTube and caches. */
export async function getVideoData(videoId: string, userId: string): Promise<{
  transcript: TranscriptSegment[] | null;
  videoTitle: string;
}> {
  const entry = cache.get(videoId);
  if (entry && Date.now() - entry.fetchedAt < TTL_MS) {
    return { transcript: entry.transcript, videoTitle: entry.title };
  }

  const [transcriptResult, videoInfoResult] = await Promise.allSettled([
    fetchTranscript(videoId),
    fetchVideoInfo(videoId, userId),
  ]);

  const transcript =
    transcriptResult.status === "fulfilled" ? transcriptResult.value : null;
  const title =
    videoInfoResult.status === "fulfilled"
      ? videoInfoResult.value.title
      : "Unknown";

  cache.set(videoId, { transcript, title, fetchedAt: Date.now() });
  return { transcript, videoTitle: title };
}
