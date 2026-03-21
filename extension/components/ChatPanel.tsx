"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  videoId?: string | null;
};

type SelectionPopup = { text: string; x: number; y: number };

type HistoryMessage = { role: "user" | "assistant"; content: string };

type Props = {
  videoId: string | null;
  videoTitle: string | null;
  hasTranscript: boolean;
  onCopyToNotebook?: (text: string) => void;
  onCopyMarkdownToNotebook?: (markdown: string) => void;
  headerControls?: React.ReactNode;
};

const STORAGE_KEY = (videoId: string) => `messages_${videoId}`;

function loadMessages(videoId: string): Promise<Message[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY(videoId), (result) => {
      resolve((result[STORAGE_KEY(videoId)] as Message[]) ?? []);
    });
  });
}

function saveMessages(videoId: string, messages: Message[]): void {
  chrome.storage.local.set({ [STORAGE_KEY(videoId)]: messages });
}

export default function ChatPanel({
  videoId,
  videoTitle,
  hasTranscript,
  onCopyToNotebook,
  onCopyMarkdownToNotebook,
  headerControls,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [videoOnly, setVideoOnly] = useState(true);
  const [videoOnlyLoaded, setVideoOnlyLoaded] = useState(false);
  const [showKeyBanner, setShowKeyBanner] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [selectionPopup, setSelectionPopup] = useState<SelectionPopup | null>(null);
  const [chatStarted, setChatStarted] = useState(false);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevVideoIdRef = useRef<string | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const allMessagesRef = useRef<Message[]>([]);
  const activeStreamId = useRef<string | null>(null);
  // Synchronous gate: set to true before async loadMessages, false when done.
  // Prevents the pill effect from firing in the same render cycle as the load start,
  // even when messagesLoaded is still true from the previous video.
  const loadingMessagesRef = useRef(false);

  // Load persisted videoOnly preference
  useEffect(() => {
    chrome.storage.local.get("videoOnly", (result) => {
      if (typeof result.videoOnly === "boolean") {
        setVideoOnly(result.videoOnly);
      }
      setVideoOnlyLoaded(true);
    });
  }, []);

  // Check API key on mount
  useEffect(() => {
    chrome.storage.local.get("anthropicApiKey", (result) => {
      const hasKey = !!result.anthropicApiKey;
      console.log(`[chat-panel] API key check: ${hasKey ? "present" : "missing → showing banner"}`);
      if (!hasKey) {
        setShowKeyBanner(true);
      }
    });
  }, []);

  // Load messages when videoId changes
  useEffect(() => {
    if (!videoId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessages([]);
      allMessagesRef.current = [];
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessagesLoaded(false);
      loadingMessagesRef.current = false;
      return;
    }
    console.log(`[chat-panel] videoId changed → ${videoId}, loading messages`);
    // Set the ref synchronously — the pill effect (which runs in the same commit)
    // checks this ref and returns early, preventing it from firing before messages load.
    loadingMessagesRef.current = true;
    setMessagesLoaded(false);
    loadMessages(videoId).then((msgs) => {
      console.log(`[chat-panel] messages loaded: ${msgs.length} msgs for ${videoId}`);
      setMessages(msgs);
      allMessagesRef.current = msgs;
      loadingMessagesRef.current = false;
      setMessagesLoaded(true);
    });
  }, [videoId]);

  // Post or update the "Started watching" pill.
  // Fires on genuine navigation AND when videoTitle corrects itself after a stale
  // tab-title was used (SPA navigation lag). In both cases we want the pill to
  // show the definitive title.
  useEffect(() => {
    if (!videoId || !messagesLoaded || loadingMessagesRef.current) return;
    const prevId = prevVideoIdRef.current;
    const isNewVideo = videoId !== prevId;

    if (isNewVideo) {
      prevVideoIdRef.current = videoId;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSuggestions(null);
      const hasConvo = allMessagesRef.current.some(
        (m) => (m.role === "user" || m.role === "assistant") && m.videoId === videoId
      );
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChatStarted(hasConvo);
    }

    // Find the most-recent pill for this video (may have been loaded from storage).
    const msgs = allMessagesRef.current;
    const existingPillIdx = msgs.reduceRight(
      (found, m, i) => (found === -1 && m.role === "system" && m.videoId === videoId ? i : found),
      -1
    );

    const newContent = `Started watching: ${videoTitle ?? videoId}`;

    if (existingPillIdx !== -1) {
      // Pill already exists — update its text if the title has changed (e.g. stale
      // tab title was later corrected by the player-response extraction).
      if (msgs[existingPillIdx].content === newContent) return;
      const updated = [...msgs];
      updated[existingPillIdx] = { ...updated[existingPillIdx], content: newContent };
      setMessages(updated);
      allMessagesRef.current = updated;
      saveMessages(videoId, updated);
      return;
    }

    // No pill yet. Only create one on genuine navigation (not a title-only update).
    if (!isNewVideo) return;

    const pill: Message = {
      id: crypto.randomUUID(),
      role: "system",
      content: newContent,
      videoId,
    };
    const updated = [...msgs, pill];
    setMessages(updated);
    allMessagesRef.current = updated;
    saveMessages(videoId, updated);
  }, [videoId, videoTitle, messagesLoaded]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  // Listen for chat chunks from background
  useEffect(() => {
    let firstChunkLogged = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listener = (msg: any) => {
      if (msg.type === "CHAT_CHUNK" && msg.streamId === activeStreamId.current) {
        if (!firstChunkLogged) {
          console.log(`[chat-panel] CHAT_CHUNK streamId=${msg.streamId} (first chunk received, streaming active)`);
          firstChunkLogged = true;
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === activeStreamId.current
              ? { ...m, content: m.content + msg.chunk }
              : m
          )
        );
      }

      if (msg.type === "CHAT_DONE" && msg.streamId === activeStreamId.current) {
        setStreaming(false);
        // Persist final assistant message
        const streamId = activeStreamId.current;
        activeStreamId.current = null;
        if (videoId && streamId) {
          setMessages((prev) => {
            const finalMsg = prev.find((m) => m.id === streamId);
            if (finalMsg && videoId) {
              const updated = prev;
              console.log(`[chat-panel] CHAT_DONE streamId=${streamId} finalLen=${finalMsg.content.length} chars`);
              saveMessages(videoId, updated);
              allMessagesRef.current = updated;
            }
            return prev;
          });
        }
      }

      if (msg.type === "CHAT_ERROR" && msg.streamId === activeStreamId.current) {
        const streamId = activeStreamId.current;
        activeStreamId.current = null;
        console.log(`[chat-panel] CHAT_ERROR streamId=${streamId} error="${msg.error}"`);
        if (msg.error === "no_api_key") {
          setShowKeyBanner(true);
        }
        const displayError =
          msg.error === "no_api_key"
            ? "Add your Anthropic API key in Settings to use chat."
            : msg.error;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamId
              ? { ...m, role: "system" as const, content: `⚠️ ${displayError}` }
              : m
          )
        );
        setStreaming(false);
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [videoId]);

  // Selection popup
  const handleMessagesMouseUp = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return;
    if (!messagesRef.current?.contains(sel.anchorNode)) return;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    setSelectionPopup({
      text: sel.toString().trim(),
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
  }, []);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (target instanceof HTMLElement && target.closest("[data-copy-popup]")) return;
      setSelectionPopup(null);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  function handleCopyToNotebook() {
    if (!selectionPopup) return;
    onCopyToNotebook?.(selectionPopup.text);
    window.getSelection()?.removeAllRanges();
    setSelectionPopup(null);
  }

  function handleQuoteInChat() {
    if (!selectionPopup) return;
    const quoted = selectionPopup.text
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    setInput((prev) => (prev ? `${prev}\n\n${quoted}\n\n` : `${quoted}\n\n`));
    if (!chatStarted) setChatStarted(true);
    window.getSelection()?.removeAllRanges();
    setSelectionPopup(null);
    setTimeout(() => {
      textareaRef.current?.focus();
      const len = textareaRef.current?.value.length ?? 0;
      textareaRef.current?.setSelectionRange(len, len);
    }, 0);
  }

  async function clearChat() {
    if (!confirm("Clear all chat messages? This cannot be undone.")) return;
    if (videoId) {
      await chrome.storage.local.remove(STORAGE_KEY(videoId));
    }
    setMessages([]);
    allMessagesRef.current = [];
    prevVideoIdRef.current = null;
    setChatStarted(false);
    setSuggestions(null);
  }

  function buildHistory(): HistoryMessage[] {
    const uaMessages = messages.filter((m) => m.role === "user" || m.role === "assistant");
    // Only include complete user/assistant pairs. A trailing user message without
    // an assistant response (e.g. from a previous failed request) would cause the
    // Anthropic API to reject the next request with a consecutive-user-messages error.
    const result: HistoryMessage[] = [];
    let i = 0;
    while (i < uaMessages.length) {
      if (
        uaMessages[i].role === "user" &&
        i + 1 < uaMessages.length &&
        uaMessages[i + 1].role === "assistant"
      ) {
        result.push({ role: "user", content: uaMessages[i].content });
        result.push({ role: "assistant", content: uaMessages[i + 1].content });
        i += 2;
      } else {
        i++;
      }
    }
    return result;
  }

  async function fetchSuggestions() {
    setLoadingSuggestions(true);
    const requestId = crypto.randomUUID();
    const history = buildHistory();
    console.log(`[chat-panel] fetchSuggestions START requestId=${requestId} history=${history.length}`);

    let settled = false;

    const listener = (msg: { type: string; requestId: string; suggestions: string[] }) => {
      if (msg.type === "SUGGEST_RESULT" && msg.requestId === requestId) {
        settled = true;
        console.log(`[chat-panel] fetchSuggestions DONE ${msg.suggestions.length} suggestions received`);
        setSuggestions(msg.suggestions);
        setLoadingSuggestions(false);
        chrome.runtime.onMessage.removeListener(listener);
      }
    };
    chrome.runtime.onMessage.addListener(listener);

    chrome.runtime.sendMessage({
      type: "SUGGEST",
      payload: {
        videoId,
        history,
        requestId,
      },
    });

    // Timeout fallback
    setTimeout(() => {
      if (!settled) {
        console.log(`[chat-panel] fetchSuggestions TIMEOUT requestId=${requestId}`);
      }
      chrome.runtime.onMessage.removeListener(listener);
      setLoadingSuggestions(false);
    }, 15000);
  }

  async function startConversation() {
    setChatStarted(true);
    await fetchSuggestions();
  }

  function sendMessage() {
    if (!input.trim() || streaming || showKeyBanner) return;

    const userText = input.trim();
    setInput("");
    setSuggestions(null);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: userText,
      videoId,
    };

    const streamId = crypto.randomUUID();
    activeStreamId.current = streamId;
    const history = buildHistory();
    console.log(`[chat-panel] sendMessage: streamId=${streamId} msg="${userText.slice(0, 60)}${userText.length > 60 ? "…" : ""}" history=${history.length} videoOnly=${videoOnly}`);

    const streamMsg: Message = {
      id: streamId,
      role: "assistant",
      content: "",
      videoId,
    };

    const withUser = [...allMessagesRef.current, userMsg];
    const withStream = [...withUser, streamMsg];
    setMessages(withStream);

    // Save user message immediately
    if (videoId) {
      saveMessages(videoId, withUser);
      allMessagesRef.current = withUser;
    }

    setStreaming(true);

    chrome.runtime.sendMessage({
      type: "CHAT",
      payload: {
        message: userText,
        history,
        videoOnly,
        videoId,
        currentTimeSec: 0,
        streamId,
      },
    });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-10 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <span className="text-[11px] font-semibold tracking-widest uppercase text-gray-500 dark:text-gray-400">Chat</span>
        <div className="flex items-center gap-1.5">
          {headerControls}
        </div>
      </div>

      {/* API key banner */}
      {showKeyBanner && (
        <div className="mx-3 mt-2 flex items-start gap-2.5 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 px-3.5 py-2.5 text-xs shrink-0">
          <svg className="shrink-0 mt-0.5 text-amber-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span className="flex-1 text-amber-800 dark:text-amber-200 leading-relaxed">
            Chat requires an Anthropic API key.{" "}
            <button
              onClick={() => {
                // Dispatch event to open settings — App.tsx listens
                window.dispatchEvent(new CustomEvent("open-settings"));
              }}
              className="underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-100 transition-colors"
            >
              Add it in Settings
            </button>
            .
          </span>
          <button
            onClick={() => setShowKeyBanner(false)}
            className="shrink-0 text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 transition-colors mt-0.5"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* Selection popup */}
      {selectionPopup && (
        <div
          data-copy-popup
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: "fixed",
            left: selectionPopup.x,
            top: selectionPopup.y - 44,
            transform: "translateX(-50%)",
          }}
          className="z-50 flex items-center gap-px bg-gray-900 dark:bg-gray-700 rounded-full shadow-lg overflow-hidden"
        >
          <button
            onClick={handleQuoteInChat}
            className="text-[11px] font-medium px-3 py-1.5 text-white hover:bg-white/10 transition-colors whitespace-nowrap"
          >
            Quote in chat
          </button>
          {onCopyToNotebook && (
            <>
              <div className="w-px h-4 bg-white/20" />
              <button
                onClick={handleCopyToNotebook}
                className="text-[11px] font-medium px-3 py-1.5 text-white hover:bg-white/10 transition-colors whitespace-nowrap"
              >
                → Notebook
              </button>
            </>
          )}
        </div>
      )}

      {/* Messages */}
      <div
        ref={messagesRef}
        onMouseUp={handleMessagesMouseUp}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-6"
      >
        {!videoId && messages.length === 0 && (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center mt-8">
            Open a YouTube video to start chatting.
          </p>
        )}

        {messages.map((msg) => (
          <div key={msg.id}>
            {msg.role === "system" ? (
              <div className="flex justify-center">
                {msg.content.startsWith("⚠️") ? (
                  <span className="text-[11px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 px-3 py-1 rounded-full">
                    {msg.content}
                  </span>
                ) : (
                  <span className="text-[11px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800/80 px-3 py-1 rounded-full font-mono">
                    {msg.content}
                  </span>
                )}
              </div>
            ) : (
              <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className="group relative max-w-[90%]">
                  <div
                    className={`px-3.5 py-2.5 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white whitespace-pre-wrap rounded-2xl rounded-tr-sm"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-2xl rounded-tl-sm"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <>
                        <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-pre:my-2 prose-pre:bg-gray-200 dark:prose-pre:bg-gray-700 prose-code:text-pink-600 dark:prose-code:text-pink-400 prose-code:before:content-none prose-code:after:content-none prose-code:font-mono prose-code:text-[0.82em]">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                        {streaming && msg.content === "" && (
                          <span className="inline-block w-1.5 h-3.5 bg-gray-400 dark:bg-gray-500 animate-pulse rounded-sm" />
                        )}
                      </>
                    ) : (
                      msg.content
                    )}
                  </div>
                  {msg.role === "assistant" && msg.content && onCopyMarkdownToNotebook && (
                    <button
                      onClick={() => onCopyMarkdownToNotebook(msg.content)}
                      className="absolute -bottom-5 left-0 opacity-0 group-hover:opacity-100 text-[10px] text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 transition-all whitespace-nowrap"
                      title="Copy to notebook"
                    >
                      → Notebook
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions */}
      {suggestions && suggestions.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 shrink-0">
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => setInput(s)}
                className="text-[12px] px-3 py-1.5 rounded-full border border-blue-200 dark:border-blue-800/60 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors text-left"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading suggestions */}
      {loadingSuggestions && chatStarted && (
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 shrink-0">
          <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center animate-pulse tracking-wide">
            Generating suggestions…
          </p>
        </div>
      )}

      {/* Action strip — chat controls */}
      {videoId && (
        <div className="flex items-center gap-2 px-3 h-8 border-t border-gray-200 dark:border-gray-800 shrink-0">
          {/* Video-only toggle — flex-1 so label compresses first at narrow widths */}
          <button
            onClick={() => setVideoOnly((v) => {
              const next = !v;
              chrome.storage.local.set({ videoOnly: next });
              return next;
            })}
            disabled={!hasTranscript}
            title={
              !hasTranscript
                ? "No transcript available"
                : videoOnly
                ? "Claude only answers based on what's said in the video. It won't use any outside knowledge."
                : "Claude can use its general knowledge in addition to what's said in the video."
            }
            className="flex items-center gap-1.5 flex-1 min-w-0 disabled:opacity-40 disabled:cursor-not-allowed group"
          >
            <div className={`relative w-7 h-4 rounded-full shrink-0 transition-colors ${videoOnly ? "bg-blue-600" : "bg-gray-200 dark:bg-gray-700 group-hover:bg-gray-300 dark:group-hover:bg-gray-600"}`}>
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${videoOnly ? "translate-x-3.5" : "translate-x-0.5"}`} />
            </div>
            <span className={`text-[11px] shrink-0 transition-colors ${videoOnly ? "text-gray-700 dark:text-gray-200" : "text-gray-400 dark:text-gray-500"}`}>
              Video only
            </span>
            <span className={`text-[10px] truncate transition-colors ${videoOnly ? "text-blue-500 dark:text-blue-400" : "text-gray-400 dark:text-gray-500"}`}>
              {videoOnly ? "· answers from the video transcript" : "· may draw on outside knowledge"}
            </span>
          </button>

          {/* Suggest */}
          <button
            onClick={fetchSuggestions}
            disabled={loadingSuggestions}
            className="shrink-0 text-[11px] px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Suggest questions"
          >
            {loadingSuggestions ? "…" : "Suggest"}
          </button>

          <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 shrink-0" />

          {/* Clear */}
          <button
            onClick={clearChat}
            disabled={messages.length === 0}
            className="shrink-0 text-[11px] px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-red-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Clear all messages"
          >
            Clear
          </button>
        </div>
      )}

      {/* Input or Start conversation */}
      <div className="px-3 py-3 border-t border-gray-200 dark:border-gray-800 shrink-0">
        {!chatStarted && videoId ? (
          <button
            onClick={startConversation}
            disabled={loadingSuggestions || showKeyBanner}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white rounded-xl text-sm font-medium transition-colors"
          >
            {loadingSuggestions ? "Loading suggestions…" : "Start conversation"}
          </button>
        ) : (
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={
                showKeyBanner
                  ? "Add your API key in Settings to chat"
                  : "Ask anything… (Enter to send)"
              }
              disabled={showKeyBanner}
              rows={2}
              className="flex-1 px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              onClick={sendMessage}
              disabled={streaming || !input.trim() || showKeyBanner}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-colors shrink-0"
            >
              Send
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
