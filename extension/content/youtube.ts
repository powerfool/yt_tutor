// Content script — runs on youtube.com pages
// Extracts transcript from ytInitialPlayerResponse and notifies the background

export {};

async function extractTranscript() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const player = (window as any).ytInitialPlayerResponse;
  if (!player) return;

  const videoId: string = player?.videoDetails?.videoId;
  const videoTitle: string = player?.videoDetails?.title ?? "Unknown Video";

  const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];

  if (tracks.length === 0) {
    chrome.runtime.sendMessage({
      type: "TRANSCRIPT_UNAVAILABLE",
      videoId,
      videoTitle,
    }).catch(() => {});
    return;
  }

  // Prefer English captions; fall back to first available
  const track =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tracks.find((t: any) => t.languageCode === "en") ?? tracks[0];

  try {
    const captionUrl = new URL(track.baseUrl);
    captionUrl.searchParams.set("fmt", "json3");
    const data = await fetch(captionUrl.toString()).then((r) => r.json());

    chrome.runtime.sendMessage({
      type: "TRANSCRIPT_READY",
      transcript: data,
      videoTitle,
      videoId,
    }).catch(() => {});
  } catch {
    chrome.runtime.sendMessage({
      type: "TRANSCRIPT_UNAVAILABLE",
      videoId,
      videoTitle,
    }).catch(() => {});
  }
}

// Run immediately on page load
extractTranscript();

// YouTube is a SPA — re-extract when navigation events fire
document.addEventListener("yt-navigate-finish", () => {
  // Small delay to allow ytInitialPlayerResponse to update after navigation
  setTimeout(extractTranscript, 1000);
});

// Also watch for URL changes as a fallback
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    // Only run on video pages
    if (location.pathname === "/watch") {
      setTimeout(extractTranscript, 1500);
    }
  }
}).observe(document, { subtree: true, childList: true });
