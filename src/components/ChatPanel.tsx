"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { TranscriptSegment, Chapter } from "@/lib/youtube";


type YTPlayer = { getCurrentTime: () => number; seekTo: (s: number, a: boolean) => void; destroy: () => void };

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  videoId?: string | null;
};

type SelectionPopup = { text: string; x: number; y: number };

type HistoryMessage = { role: "user" | "assistant"; content: string };

type Props = {
  projectId: string;
  videoId: string | null;
  videoTitle: string | null;
  transcript: TranscriptSegment[] | null;
  playerRef: React.MutableRefObject<YTPlayer | null>;
  onCopyToNotebook?: (text: string) => void;
  onCopyMarkdownToNotebook?: (markdown: string) => void;
  onChaptersGenerated?: (chapters: Chapter[]) => void;
  chapters?: Chapter[];
};

export default function ChatPanel({ projectId, videoId, videoTitle, transcript, playerRef, onCopyToNotebook, onCopyMarkdownToNotebook, onChaptersGenerated, chapters }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [videoOnly, setVideoOnly] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [selectionPopup, setSelectionPopup] = useState<SelectionPopup | null>(null);
  const [chatStarted, setChatStarted] = useState(false);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevVideoIdRef = useRef<string | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const allMessagesRef = useRef<Message[]>([]);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/messages`)
      .then((r) => r.json())
      .then((msgs) => {
        setMessages(msgs);
        allMessagesRef.current = msgs;
        setMessagesLoaded(true);
      });
  }, [projectId]);

  useEffect(() => {
    if (!videoId || !messagesLoaded) return;
    if (videoId === prevVideoIdRef.current) return;
    prevVideoIdRef.current = videoId;

    setSuggestions(null);

    const msgs = allMessagesRef.current;
    const hasConvo = msgs.some(
      (m) => (m.role === "user" || m.role === "assistant") && m.videoId === videoId
    );
    const hasSystemMsg = msgs.some(
      (m) => m.role === "system" && m.videoId === videoId
    );

    if (hasConvo) {
      // Returning to a video with existing conversation — restore state
      setChatStarted(true);
      return;
    }

    // New video — reset chat state
    setChatStarted(false);

    if (!hasSystemMsg) {
      const content = `Started watching: ${videoTitle ?? videoId}`;
      fetch(`/api/projects/${projectId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "system", content, videoId }),
      })
        .then((r) => r.json())
        .then((saved) => {
          setMessages((prev) => [...prev, saved]);
          allMessagesRef.current = [...allMessagesRef.current, saved];
        });
    }
  }, [videoId, videoTitle, projectId, messagesLoaded]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  const handleMessagesMouseUp = useCallback(() => {
    if (!onCopyToNotebook) return;
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
  }, [onCopyToNotebook]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        target instanceof HTMLElement &&
        target.closest("[data-copy-popup]")
      ) return;
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

  async function clearChat() {
    if (!confirm("Clear all chat messages? This cannot be undone.")) return;
    await fetch(`/api/projects/${projectId}/messages`, { method: "DELETE" });
    setMessages([]);
    allMessagesRef.current = [];
    prevVideoIdRef.current = null;
    setChatStarted(false);
    setSuggestions(null);
  }

  function buildHistory(): HistoryMessage[] {
    return messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  }

  function getCurrentChapter(): Chapter | null {
    if (!chapters || chapters.length === 0) return null;
    const currentSec = playerRef.current?.getCurrentTime() ?? 0;
    return chapters.reduce<Chapter>((best, ch) =>
      ch.startTimeSec <= currentSec ? ch : best
    , chapters[0]);
  }

  async function fetchSuggestions() {
    setLoadingSuggestions(true);
    try {
      const res = await fetch("/api/chat/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          videoTitle,
          currentTimeSec: playerRef.current?.getCurrentTime() ?? 0,
          history: buildHistory(),
          currentChapter: getCurrentChapter(),
        }),
      });
      if (res.ok) {
        const { suggestions: s } = await res.json();
        setSuggestions(s);
      }
    } finally {
      setLoadingSuggestions(false);
    }
  }

  async function fetchChapters() {
    if (!transcript || transcript.length === 0 || !onChaptersGenerated) return;
    try {
      const res = await fetch("/api/chat/chapters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, videoTitle }),
      });
      if (res.ok) {
        const { chapters } = await res.json();
        if (Array.isArray(chapters) && chapters.length > 0) {
          onChaptersGenerated(chapters);
        }
      }
    } catch {
      // non-fatal
    }
  }

  async function startConversation() {
    setChatStarted(true);
    const tasks: Promise<void>[] = [fetchSuggestions()];
    // Only generate chapters if none are already loaded (e.g. from saved watch history)
    if (!chapters || chapters.length === 0) {
      tasks.push(fetchChapters());
    }
    await Promise.all(tasks);
  }

  async function sendMessage() {
    if (!input.trim() || streaming) return;

    const userText = input.trim();
    setInput("");
    setSuggestions(null);

    const tempId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: tempId, role: "user", content: userText, videoId },
    ]);

    fetch(`/api/projects/${projectId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "user", content: userText, videoId }),
    }).then((r) => r.json()).then((saved) => {
      allMessagesRef.current = [...allMessagesRef.current, saved];
    });

    setStreaming(true);
    const streamId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: streamId, role: "assistant", content: "", videoId },
    ]);

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userText,
        history: buildHistory(),
        videoOnly,
        transcript,
        videoTitle,
        currentTimeSec: playerRef.current?.getCurrentTime() ?? 0,
      }),
    });

    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Unexpected error from AI." }));
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamId ? { ...m, role: "system" as const, content: `⚠️ ${error}` } : m
        )
      );
      setStreaming(false);
      return;
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullText += decoder.decode(value, { stream: true });
      setMessages((prev) =>
        prev.map((m) => (m.id === streamId ? { ...m, content: fullText } : m))
      );
    }

    setStreaming(false);

    fetch(`/api/projects/${projectId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "assistant", content: fullText, videoId }),
    }).then((r) => r.json()).then((saved) => {
      allMessagesRef.current = [...allMessagesRef.current, saved];
    });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <span className="text-[11px] font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">Chat</span>
        <div className="flex items-center gap-1.5">
          {videoId && (
            <button
              onClick={fetchSuggestions}
              disabled={loadingSuggestions}
              className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Suggest questions"
            >
              {loadingSuggestions ? "…" : "Suggest"}
            </button>
          )}
          <button
            onClick={clearChat}
            disabled={messages.length === 0}
            className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-red-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Clear all messages"
          >
            Clear
          </button>
          <button
            onClick={() => setVideoOnly((v) => !v)}
            disabled={!videoId}
            title={videoOnly ? "Answers draw only from the video (no outside knowledge)" : "Answers may use general knowledge in addition to the video"}
            className="flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed group"
          >
            <span className={`text-[11px] transition-colors ${videoOnly ? "text-gray-700 dark:text-gray-200" : "text-gray-400 dark:text-gray-500"}`}>
              Video only
            </span>
            <div className={`relative w-7 h-4 rounded-full transition-colors ${videoOnly ? "bg-blue-600" : "bg-gray-200 dark:bg-gray-700 group-hover:bg-gray-300 dark:group-hover:bg-gray-600"}`}>
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${videoOnly ? "translate-x-3.5" : "translate-x-0.5"}`} />
            </div>
          </button>
        </div>
      </div>

      {/* Copy-to-notebook popup */}
      {selectionPopup && onCopyToNotebook && (
        <button
          data-copy-popup
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleCopyToNotebook}
          style={{
            position: "fixed",
            left: selectionPopup.x,
            top: selectionPopup.y - 38,
            transform: "translateX(-50%)",
          }}
          className="z-50 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium px-3 py-1.5 rounded-full shadow-lg whitespace-nowrap transition-colors"
        >
          Copy to notebook
        </button>
      )}

      {/* Messages */}
      <div
        ref={messagesRef}
        onMouseUp={handleMessagesMouseUp}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-6"
      >
        {/* Start conversation CTA */}
        {!chatStarted && videoId && messages.filter((m) => (m.role === "user" || m.role === "assistant") && m.videoId === videoId).length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center">
              Ready to explore this video with AI
            </p>
            <button
              onClick={startConversation}
              disabled={loadingSuggestions}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white rounded-full text-sm font-medium transition-colors"
            >
              {loadingSuggestions ? "Loading suggestions…" : "Start conversation"}
            </button>
          </div>
        )}

        {/* Placeholder — no video */}
        {!videoId && messages.length === 0 && (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center mt-8">
            Ask anything — load a video to discuss it
          </p>
        )}

        {messages.map((msg) => (
          <div key={msg.id}>
            {msg.role === "system" ? (
              <div className="flex justify-center">
                <span className="text-[11px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800/80 px-3 py-1 rounded-full font-mono">
                  {msg.content}
                </span>
              </div>
            ) : (
              <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`group relative max-w-[85%]`}>
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

      {/* Input */}
      <div className="px-3 py-3 border-t border-gray-200 dark:border-gray-800 shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask anything… (Enter to send, Shift+Enter for new line)"
            rows={2}
            className="flex-1 px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 transition-colors"
          />
          <button
            onClick={sendMessage}
            disabled={streaming || !input.trim()}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-colors shrink-0"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
