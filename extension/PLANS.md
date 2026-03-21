# Extension: Future Plans

## Per-tab context

### Motivation

The background currently holds a single `currentState: AppState` — one global context for the whole extension. When the user has multiple tabs open and switches between them, the in-memory page content (`markdownContent`) for a previously-visited tab is lost and must be re-extracted on the next interaction. This is cheap (defuddle is synchronous, no network), but avoidable.

### The core change

Replace `currentState: AppState` with `tabStates: Map<number, TabState>` — one entry per tab. The sidebar passes its `tabId` in every message so the background always operates on the right entry.

### What changes

**`background.ts`**
- `tabStates = new Map<number, TabState>()` replaces `currentState`
- All state reads/writes become `tabStates.get(tabId)` / `tabStates.set(tabId, ...)`
- `chrome.tabs.onRemoved` cleans up the entry (and optionally its storage keys)
- `WEBPAGE_NAVIGATED` and `YOUTUBE_NAVIGATED` already carry `sender.tab.id` — each updates only that tab's entry
- `GET_STATE` requires a `tabId` in the payload; returns that tab's state
- `CHAT`, `SUGGEST`, `EXTRACT_TAB` already carry or can derive `tabId` from `sender`
- `handleTabActivated` just ensures the entry exists and is fresh for the activated tab

**`sidebar/App.tsx`**
- On mount, determine own `tabId` via `chrome.tabs.query({ active: true, currentWindow: true })` and store in a ref
- Pass `tabId` in `GET_STATE`, `CHAT`, `SUGGEST`, `EXTRACT_TAB` payloads
- All broadcasts (`VIDEO_STATE`, `WEBPAGE_STATE`, `CLEAR_STATE`, `PREFILL_INPUT`) include a `tabId` — sidebar ignores messages not addressed to its tab

**Storage**
- Per-tab persistence is optional (service worker restarts are rare). Could use `tabstate_${tabId}` keys if desired, but in-memory is probably sufficient.

### What you gain

Switching back to a webpage you already chatted on recovers the full extracted content from memory — no re-extraction. Each tab's `markdownContent`, messages, and mode are fully independent.

### Complexity

Medium. The background refactor is mechanical — every `currentState` reference becomes `tabStates.get(tabId)`. The main new logic is ensuring every message path carries a `tabId` and that broadcasts are tab-targeted. Roughly 150–200 lines changed, no new concepts.
