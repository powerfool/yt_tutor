// Server-only — uses Node.js built-ins. Never import this from a client component.
import { execFile } from "child_process";
import { promisify } from "util";
import { readFile, unlink, readdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { TranscriptSegment, Chapter } from "./youtube";
import { getYoutubeApiKey } from "@/lib/settings";

const execFileAsync = promisify(execFile);

/** Parse YouTube-style chapters from a video description.
 *  Each chapter line must start with a timestamp (0:00, 1:30, 1:00:00).
 *  Returns null if fewer than 3 chapters are found. */
function parseChaptersFromDescription(description: string): Chapter[] | null {
  const chapters: Chapter[] = [];
  for (const line of description.split("\n")) {
    const m = line.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})[\s\-–—•|:]+(.+)/);
    if (!m) continue;
    const h = m[1] ? parseInt(m[1]) : 0;
    const min = parseInt(m[2]);
    const sec = parseInt(m[3]);
    const title = m[4].trim();
    if (title) chapters.push({ title, startTimeSec: h * 3600 + min * 60 + sec });
  }
  return chapters.length >= 3 ? chapters : null;
}

/** Fetch video title + any chapters embedded in the description. */
export async function fetchVideoInfo(videoId: string): Promise<{ title: string; ytChapters: Chapter[] | null }> {
  const apiKey = await getYoutubeApiKey();
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  const snippet = data.items?.[0]?.snippet;
  const title = snippet?.title ?? "Untitled video";
  const ytChapters = parseChaptersFromDescription(snippet?.description ?? "");
  return { title, ytChapters };
}

/** @deprecated Use fetchVideoInfo */
export async function fetchVideoTitle(videoId: string): Promise<string> {
  return (await fetchVideoInfo(videoId)).title;
}

/** Fetch transcript segments. Returns null if unavailable. */
export async function fetchTranscript(
  videoId: string
): Promise<TranscriptSegment[] | null> {
  try {
    const UA =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    // Fetch the watch page — capture cookies so the caption URL request is authenticated
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    // Forward session cookies to subsequent requests
    const cookies = pageRes.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");

    const html = await pageRes.text();

    // Extract the ytInitialPlayerResponse JSON blob embedded in the page
    const startIdx = html.indexOf("ytInitialPlayerResponse = ");
    if (startIdx === -1) {
      console.warn(`[YT] could not find ytInitialPlayerResponse start for ${videoId}`);
      return fetchTranscriptYtDlp(videoId);
    }
    const jsonStart = html.indexOf("{", startIdx);
    let depth = 0;
    let jsonEnd = jsonStart;
    for (let i = jsonStart; i < html.length; i++) {
      if (html[i] === "{") depth++;
      else if (html[i] === "}") { depth--; if (depth === 0) { jsonEnd = i; break; } }
    }
    if (jsonEnd <= jsonStart) {
      console.warn(`[YT] could not parse ytInitialPlayerResponse for ${videoId}`);
      return fetchTranscriptYtDlp(videoId);
    }
    const playerJson = html.slice(jsonStart, jsonEnd + 1);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const playerResponse: any = JSON.parse(playerJson);
    const captionTracks: Array<{ languageCode: string; baseUrl: string }> =
      playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];

    if (captionTracks.length === 0) {
      console.warn(`[YT] no caption tracks found for ${videoId}, trying yt-dlp`);
      return fetchTranscriptYtDlp(videoId);
    }

    // Prefer English; fall back to first available track
    const track =
      captionTracks.find((t) => t.languageCode === "en") ??
      captionTracks.find((t) => t.languageCode.startsWith("en")) ??
      captionTracks[0];

    console.log(`[YT] using caption track: ${track.languageCode} for ${videoId}`);

    // Build URL — replace any existing fmt param
    const captionUrl = new URL(track.baseUrl);
    captionUrl.searchParams.set("fmt", "json3");

    const transcriptRes = await fetch(captionUrl.toString(), {
      headers: {
        "User-Agent": UA,
        "Cookie": cookies,
        "Referer": `https://www.youtube.com/watch?v=${videoId}`,
      },
    });
    const rawText = await transcriptRes.text();

    console.log(`[YT] caption response status: ${transcriptRes.status}, length: ${rawText.length}`);

    if (rawText.length < 10) {
      console.warn(`[YT] empty caption response for ${videoId}, trying yt-dlp`);
      return fetchTranscriptYtDlp(videoId);
    }

    let segments: TranscriptSegment[] = [];

    if (rawText.trimStart().startsWith("{")) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = JSON.parse(rawText);
      segments = (data.events ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((e: any) => Array.isArray(e.segs))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((e: any) => ({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          text: e.segs.map((s: any) => s.utf8 ?? "").join("").trim(),
          offset: e.tStartMs ?? 0,
          duration: e.dDurationMs ?? 0,
        }))
        .filter((s: TranscriptSegment) => s.text.length > 0);
    } else {
      // XML fallback
      const xmlSegments = rawText.matchAll(/<text\s+start="([\d.]+)"\s+dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g);
      for (const m of xmlSegments) {
        const text = m[3]
          .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/<[^>]+>/g, "").trim();
        if (text) {
          segments.push({
            text,
            offset: Math.round(parseFloat(m[1]) * 1000),
            duration: Math.round(parseFloat(m[2]) * 1000),
          });
        }
      }
    }

    if (segments.length === 0) {
      console.warn(`[YT] direct fetch empty for ${videoId}, trying yt-dlp`);
      return fetchTranscriptYtDlp(videoId);
    }

    console.log(`[YT] transcript fetched: ${segments.length} segments for ${videoId}`);
    return segments;
  } catch (err) {
    console.warn(`[YT] direct transcript fetch failed for ${videoId}:`, err);
    return fetchTranscriptYtDlp(videoId);
  }
}

/** Fallback transcript fetch using yt-dlp (requires yt-dlp in PATH). */
async function fetchTranscriptYtDlp(
  videoId: string
): Promise<TranscriptSegment[] | null> {
  const tmpBase = join(tmpdir(), `yt_tutor_${videoId}_${Date.now()}`);

  try {
    await execFileAsync("yt-dlp", [
      "--js-runtimes", "node",
      "--write-subs",
      "--write-auto-subs",
      "--sub-lang", "en",
      "--sub-format", "json3",
      "--skip-download",
      "--no-playlist",
      "--output", tmpBase,
      `https://www.youtube.com/watch?v=${videoId}`,
    ], { timeout: 30000 });
  } catch (err) {
    console.warn(`[YT] yt-dlp failed for ${videoId}:`, err);
    return null;
  }

  try {
    const tmpDir = tmpdir();
    const files = await readdir(tmpDir);
    const subFile = files.find(
      (f) => f.startsWith(`yt_tutor_${videoId}`) && f.endsWith(".json3")
    );

    if (!subFile) {
      console.warn(`[YT] yt-dlp ran but no .json3 file found for ${videoId}`);
      return null;
    }

    const subPath = join(tmpDir, subFile);
    const subContent = await readFile(subPath, "utf-8");
    await unlink(subPath).catch(() => {});

    const segments = parseJson3(subContent);
    if (segments.length === 0) {
      console.warn(`[YT] yt-dlp json3 parsed but empty for ${videoId}`);
      return null;
    }

    console.log(`[YT] yt-dlp transcript: ${segments.length} segments for ${videoId}`);
    return segments;
  } catch (err) {
    console.warn(`[YT] yt-dlp VTT read failed for ${videoId}:`, err);
    return null;
  }
}

/** Parse a YouTube json3 subtitle file into TranscriptSegments. */
function parseJson3(raw: string): TranscriptSegment[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = JSON.parse(raw);
    return (data.events ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((e: any) => Array.isArray(e.segs))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((e: any) => ({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        text: e.segs.map((s: any) => s.utf8 ?? "").join("").replace(/\n/g, " ").trim(),
        offset: e.tStartMs ?? 0,
        duration: e.dDurationMs ?? 0,
      }))
      .filter((s: TranscriptSegment) => s.text.length > 0);
  } catch {
    return [];
  }
}
