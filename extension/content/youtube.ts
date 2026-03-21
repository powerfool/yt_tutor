// Content script — runs on youtube.com pages
// Cannot access ytInitialPlayerResponse directly (isolated world).
// Instead, notifies the background service worker which uses world:"MAIN" to extract it.

export {};

function notifyBackground() {
  if (location.pathname === "/watch") {
    chrome.runtime.sendMessage({ type: "YOUTUBE_NAVIGATED" }).catch(() => {});
  }
}

// Notify on initial script injection (page load or fresh install injection)
notifyBackground();

// YouTube is a SPA — yt-navigate-finish fires after each in-app navigation
document.addEventListener("yt-navigate-finish", () => {
  // Small delay to allow ytInitialPlayerResponse to update after the SPA navigation
  setTimeout(notifyBackground, 800);
});

// URL-change fallback (in case yt-navigate-finish doesn't fire)
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    if (location.pathname === "/watch") {
      setTimeout(notifyBackground, 1200);
    }
  }
}).observe(document, { subtree: true, childList: true });
