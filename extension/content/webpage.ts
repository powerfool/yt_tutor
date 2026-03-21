// Content script for non-YouTube pages — runs at document_idle
import Defuddle from "defuddle";

function sendNavigated() {
  chrome.runtime.sendMessage({
    type: "WEBPAGE_NAVIGATED",
    url: location.href,
    title: document.title,
  }).catch(() => {});
}

// On initial injection, notify background
sendNavigated();

// SPA navigation: popstate / hashchange
window.addEventListener("popstate", () => sendNavigated());
window.addEventListener("hashchange", () => sendNavigated());

// Title MutationObserver — catches Next.js / React Router navigation
let lastUrl = location.href;
const titleEl = document.querySelector("title");
const observeTarget = titleEl ?? document.documentElement;
const navObserver = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    sendNavigated();
  }
});
navObserver.observe(observeTarget, { subtree: true, childList: true, characterData: true });

// ── Extract page content on demand ───────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "EXTRACT_PAGE_CONTENT") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = new (Defuddle as any)(document, { markdown: true }).parse();
      sendResponse({ markdownContent: result.content ?? null });
    } catch {
      sendResponse({ markdownContent: null });
    }
    return true;
  }
});

// ── Floating "Ask AI" button on text selection ────────────────────────────────

let floatingHost: HTMLElement | null = null;

function removeButton() {
  if (floatingHost) {
    floatingHost.remove();
    floatingHost = null;
  }
}

function createButton(x: number, y: number, selectedText: string) {
  removeButton();

  const host = document.createElement("div");
  // Position the shadow host; the button inside inherits this offset
  host.style.cssText = [
    "position:fixed",
    `left:${x}px`,
    `top:${y - 40}px`,
    "transform:translateX(-50%)",
    "z-index:2147483647",
    "pointer-events:none",
  ].join(";");

  const shadow = host.attachShadow({ mode: "open" });

  const btn = document.createElement("button");
  btn.textContent = "Ask AI";
  btn.style.cssText = [
    "pointer-events:auto",
    "background:#1d4ed8",
    "color:#fff",
    "border:none",
    "border-radius:999px",
    "padding:5px 12px",
    "font-size:12px",
    "font-weight:600",
    "cursor:pointer",
    "box-shadow:0 2px 8px rgba(0,0,0,0.3)",
    "font-family:system-ui,-apple-system,sans-serif",
    "white-space:nowrap",
  ].join(";");

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    removeButton();
    chrome.runtime.sendMessage({ type: "WEBPAGE_SELECTION", selectedText }).catch(() => {});
    chrome.runtime.sendMessage({ type: "OPEN_SIDEBAR" }).catch(() => {});
  });

  shadow.appendChild(btn);
  document.body.appendChild(host);
  floatingHost = host;
}

document.addEventListener("mouseup", () => {
  // Small delay so the selection is finalised before we read it
  setTimeout(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      removeButton();
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    createButton(rect.left + rect.width / 2, rect.top, sel.toString().trim());
  }, 10);
});

document.addEventListener("mousedown", (e) => {
  // Dismiss unless the user is clicking inside our shadow host
  if (floatingHost && e.composedPath().includes(floatingHost)) return;
  removeButton();
});

document.addEventListener("scroll", removeButton, { passive: true, capture: true });
