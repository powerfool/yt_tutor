// Client-safe exports — no Node.js built-ins here.
// Server-only functions (fetchTranscript, fetchVideoTitle) live in youtube.server.ts

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
