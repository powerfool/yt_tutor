export type TranscriptSegment = {
  text: string;
  offset: number;   // ms
  duration: number; // ms
};

export type VideoInfo = {
  title: string;
  transcript: TranscriptSegment[] | null;
};

/** Parse a YouTube video ID from any common URL format. */
export function parseVideoId(input: string): string | null {
  try {
    const url = new URL(input.trim());
    if (url.hostname === "youtu.be") return url.pathname.slice(1);
    if (url.hostname.includes("youtube.com")) {
      if (url.pathname.startsWith("/shorts/")) return url.pathname.split("/")[2];
      if (url.pathname.startsWith("/embed/")) return url.pathname.split("/")[2];
      return url.searchParams.get("v");
    }
  } catch {
    // Not a URL — treat as bare video ID if it looks like one
    if (/^[a-zA-Z0-9_-]{11}$/.test(input.trim())) return input.trim();
  }
  return null;
}

/** Fetch video title from YouTube Data API v3. */
export async function fetchVideoTitle(videoId: string): Promise<string> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.items?.[0]?.snippet?.title ?? "Untitled video";
}

/** Fetch transcript segments. Returns null if unavailable. */
export async function fetchTranscript(
  videoId: string
): Promise<TranscriptSegment[] | null> {
  try {
    const { YoutubeTranscript } = await import("youtube-transcript");
    const raw = await YoutubeTranscript.fetchTranscript(videoId);
    return raw.map((s) => ({
      text: s.text,
      offset: s.offset,
      duration: s.duration,
    }));
  } catch {
    return null;
  }
}
