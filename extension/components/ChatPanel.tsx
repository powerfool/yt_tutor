"use client";

import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type PageMode = "youtube" | "webpage" | "none";

type WebpageContext = { url: string; title: string; markdownContent: string | null };

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  videoId?: string | null; // contextId (videoId for youtube, normalizedUrl for webpage)
};

type SelectionPopup = { text: string; x: number; y: number };

type HistoryMessage = { role: "user" | "assistant"; content: string };

type Props = {
  videoId: string | null;       // YouTube video ID (null for webpage mode)
  videoTitle: string | null;
  hasTranscript: boolean;
  onCopyToNotebook?: (text: string) => void;
  onCopyMarkdownToNotebook?: (markdown: string) => void;
  headerControls?: React.ReactNode;
  mode?: PageMode;
  webpageContext?: WebpageContext | null;
  contextId?: string | null;    // stable ID for storage (videoId or normalizedUrl)
};

export type ChatPanelHandle = {
  prefillQuote: (text: string) => void;
};

function storageKey(mode: PageMode, id: string): string {
  return mode === "youtube" ? `messages_${id}` : `webpage_msgs_${id}`;
}

function loadMessages(mode: PageMode, id: string): Promise<Message[]> {
  const key = storageKey(mode, id);
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve((result[key] as Message[]) ?? []);
    });
  });
}

function saveMessages(mode: PageMode, id: string, messages: Message[]): void {
  chrome.storage.local.set({ [storageKey(mode, id)]: messages });
}

const ChatPanel = forwardRef<ChatPanelHandle, Props>(function ChatPanel({
  videoId,
  videoTitle,
  hasTranscript,
  onCopyToNotebook,
  onCopyMarkdownToNotebook,
  headerControls,
  mode = "youtube",
  webpageContext,
  contextId,
}: Props, ref) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [videoOnly, setVideoOnly] = useState(true);
  const [showKeyBanner, setShowKeyBanner] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [selectionPopup, setSelectionPopup] = useState<SelectionPopup | null>(null);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevContextIdRef = useRef<string | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const allMessagesRef = useRef<Message[]>([]);
  const activeStreamId = useRef<string | null>(null);
  const loadingMessagesRef = useRef(false);

  // Expose prefillQuote via ref
  useImperativeHandle(ref, () => ({
    prefillQuote: (text: string) => {
      const quoted = text
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
      setInput(`${quoted}\n\n`);
      setTimeout(() => {
        textareaRef.current?.focus();
        const len = textareaRef.current?.value.length ?? 0;
        textareaRef.current?.setSelectionRange(len, len);
      }, 0);
    },
  }));

  // Load persisted videoOnly / pageOnly preference
  useEffect(() => {
    const prefKey = mode === "webpage" ? "pageOnly" : "videoOnly";
    chrome.storage.local.get(prefKey, (result) => {
      if (typeof result[prefKey] === "boolean") {
        setVideoOnly(result[prefKey] as boolean);
      }
    });
  }, [mode]);

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

  // Load messages when contextId changes
  useEffect(() => {
    setInput(""); // always clear typed input when context switches
    if (!contextId) {
      setMessages([]);
      allMessagesRef.current = [];
      setMessagesLoaded(false);
      loadingMessagesRef.current = false;
      return;
    }
    console.log(`[chat-panel] contextId changed → ${contextId}, loading messages`);
    loadingMessagesRef.current = true;
    setMessagesLoaded(false);
    loadMessages(mode, contextId).then((msgs) => {
      console.log(`[chat-panel] messages loaded: ${msgs.length} msgs for ${contextId}`);
      setMessages(msgs);
      allMessagesRef.current = msgs;
      loadingMessagesRef.current = false;
      setMessagesLoaded(true);
    });
  }, [contextId, mode]);

  // Handle new context navigation: reset suggestions
  useEffect(() => {
    if (!contextId || !messagesLoaded || loadingMessagesRef.current) return;
    const prevId = prevContextIdRef.current;
    const isNewContext = contextId !== prevId;

    if (isNewContext) {
      prevContextIdRef.current = contextId;
      setSuggestions(null);
    }

    // Update the existing pill's label if videoTitle changed (YouTube only)
    if (mode !== "youtube") return;

    const msgs = allMessagesRef.current;
    const existingPillIdx = msgs.reduceRight(
      (found, m, i) => (found === -1 && m.role === "system" && m.videoId === contextId ? i : found),
      -1
    );

    const newContent = `Started watching: ${videoTitle ?? videoId}`;
    if (existingPillIdx !== -1 && msgs[existingPillIdx].content !== newContent) {
      const updated = [...msgs];
      updated[existingPillIdx] = { ...updated[existingPillIdx], content: newContent };
      setMessages(updated);
      allMessagesRef.current = updated;
      if (contextId) saveMessages(mode, contextId, updated);
    }
  }, [contextId, videoTitle, messagesLoaded, mode, videoId]);

  // Create session pill on first interaction (deferred from navigation)
  function ensureSessionPill() {
    if (!contextId) return;
    const hasExistingPill = allMessagesRef.current.some(
      (m) => m.role === "system" && m.videoId === contextId && !m.content.startsWith("⚠️")
    );
    if (hasExistingPill) return;

    const label = mode === "webpage"
      ? `Browsing: ${webpageContext?.title || webpageContext?.url || "page"}`
      : `Started watching: ${videoTitle ?? videoId}`;

    const pill: Message = {
      id: crypto.randomUUID(),
      role: "system",
      content: label,
      videoId: contextId,
    };
    const updated = [...allMessagesRef.current, pill];
    setMessages(updated);
    allMessagesRef.current = updated;
    saveMessages(mode, contextId, updated);
  }

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
          console.log(`[chat-panel] CHAT_CHUNK streamId=${msg.streamId} (first chunk received)`);
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
        const streamId = activeStreamId.current;
        activeStreamId.current = null;
        if (contextId && streamId) {
          setMessages((prev) => {
            const finalMsg = prev.find((m) => m.id === streamId);
            if (finalMsg && contextId) {
              console.log(`[chat-panel] CHAT_DONE streamId=${streamId} finalLen=${finalMsg.content.length} chars`);
              saveMessages(mode, contextId, prev);
              allMessagesRef.current = prev;
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
  }, [contextId, mode]);

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
    if (contextId) {
      await chrome.storage.local.remove(storageKey(mode, contextId));
    }
    setMessages([]);
    allMessagesRef.current = [];
    prevContextIdRef.current = null;
    setSuggestions(null);
  }

  function buildHistory(): HistoryMessage[] {
    const uaMessages = messages.filter((m) => m.role === "user" || m.role === "assistant");
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
    ensureSessionPill();
    setLoadingSuggestions(true);
    const requestId = crypto.randomUUID();
    const history = buildHistory();
    console.log(`[chat-panel] fetchSuggestions START requestId=${requestId} mode=${mode} history=${history.length}`);

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
        mode,
        webpageContext: mode === "webpage" ? webpageContext : null,
      },
    });

    setTimeout(() => {
      if (!settled) {
        console.log(`[chat-panel] fetchSuggestions TIMEOUT requestId=${requestId}`);
      }
      chrome.runtime.onMessage.removeListener(listener);
      setLoadingSuggestions(false);
    }, 15000);
  }

  function sendMessage() {
    if (!input.trim() || streaming || showKeyBanner) return;

    ensureSessionPill();

    const userText = input.trim();
    setInput("");
    setSuggestions(null);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: userText,
      videoId: contextId,
    };

    const streamId = crypto.randomUUID();
    activeStreamId.current = streamId;
    const history = buildHistory();
    console.log(`[chat-panel] sendMessage: streamId=${streamId} mode=${mode} msg="${userText.slice(0, 60)}${userText.length > 60 ? "…" : ""}" history=${history.length} videoOnly=${videoOnly}`);

    const streamMsg: Message = {
      id: streamId,
      role: "assistant",
      content: "",
      videoId: contextId,
    };

    const withUser = [...allMessagesRef.current, userMsg];
    const withStream = [...withUser, streamMsg];
    setMessages(withStream);

    if (contextId) {
      saveMessages(mode, contextId, withUser);
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
        mode,
        webpageContext: mode === "webpage" ? webpageContext : null,
      },
    });
  }

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }, [input]);

  const toggleLabel = "Focus";
  const toggleDesc = videoOnly
    ? (mode === "webpage" ? "· answers from page only" : "· answers from transcript")
    : "· may draw on outside knowledge";
  const toggleTooltipOn = mode === "webpage"
    ? "Claude only answers based on the page content. It won't use any outside knowledge."
    : "Claude only answers based on what's said in the video. It won't use any outside knowledge.";
  const toggleTooltipOff = mode === "webpage"
    ? "Claude can use its general knowledge in addition to the page content."
    : "Claude can use its general knowledge in addition to what's said in the video.";
  const toggleDisabled = mode === "youtube" && !hasTranscript;

  const showContextId = contextId; // whether we have an active context for chat

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
              onClick={() => window.dispatchEvent(new CustomEvent("open-settings"))}
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
        {!showContextId && messages.length === 0 && (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center mt-8">
            {mode === "webpage"
              ? "Ask a question about this page, or select text and click \"Ask AI\"."
              : "Open a YouTube video to start chatting."}
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
      {loadingSuggestions && (
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 shrink-0">
          <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center animate-pulse tracking-wide">
            Generating suggestions…
          </p>
        </div>
      )}

      {/* Action strip — chat controls */}
      {showContextId && (
        <div className="flex items-center gap-2 px-3 h-8 border-t border-gray-200 dark:border-gray-800 shrink-0">
          {/* Page-only / Video-only toggle */}
          <button
            onClick={() => {
              const prefKey = mode === "webpage" ? "pageOnly" : "videoOnly";
              setVideoOnly((v) => {
                const next = !v;
                chrome.storage.local.set({ [prefKey]: next });
                return next;
              });
            }}
            disabled={toggleDisabled}
            title={
              toggleDisabled
                ? "No transcript available"
                : videoOnly
                ? toggleTooltipOn
                : toggleTooltipOff
            }
            className="flex items-center gap-1.5 flex-1 min-w-0 disabled:opacity-40 disabled:cursor-not-allowed group"
          >
            <div className={`relative w-7 h-4 rounded-full shrink-0 transition-colors ${videoOnly ? "bg-blue-600" : "bg-gray-200 dark:bg-gray-700 group-hover:bg-gray-300 dark:group-hover:bg-gray-600"}`}>
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${videoOnly ? "translate-x-3.5" : "translate-x-0.5"}`} />
            </div>
            <span className={`text-[11px] shrink-0 transition-colors ${videoOnly ? "text-gray-700 dark:text-gray-200" : "text-gray-400 dark:text-gray-500"}`}>
              {toggleLabel}
            </span>
            <span className={`text-[10px] truncate transition-colors ${videoOnly ? "text-blue-500 dark:text-blue-400" : "text-gray-400 dark:text-gray-500"}`}>
              {toggleDesc}
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

      {/* Input */}
      <div className="px-3 py-3 border-t border-gray-200 dark:border-gray-800 shrink-0">
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
                  : mode === "webpage"
                  ? "Ask about this page… (Enter to send)"
                  : "Ask anything… (Enter to send)"
              }
              disabled={showKeyBanner}
              rows={1}
              className="flex-1 px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 resize-none overflow-y-auto focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              onClick={sendMessage}
              disabled={streaming || !input.trim() || showKeyBanner}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-colors shrink-0"
            >
              Send
            </button>
          </div>
      </div>
    </div>
  );
});

export default ChatPanel;
