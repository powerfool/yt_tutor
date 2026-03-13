"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { TranscriptSegment } from "@/lib/youtube";

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
};

export default function ChatPanel({ projectId, videoId, videoTitle, transcript, playerRef, onCopyToNotebook }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [videoOnly, setVideoOnly] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [selectionPopup, setSelectionPopup] = useState<SelectionPopup | null>(null);
  const [chatStarted, setChatStarted] = useState(false);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevVideoIdRef = useRef<string | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  // Load existing messages on mount
  useEffect(() => {
    fetch(`/api/projects/${projectId}/messages`)
      .then((r) => r.json())
      .then(setMessages);
  }, [projectId]);

  // Insert system message + reset chat UI when video changes
  useEffect(() => {
    if (!videoId || videoId === prevVideoIdRef.current) return;
    prevVideoIdRef.current = videoId;

    // Reset conversation starter state
    setChatStarted(false);
    setSuggestions(null);

    const systemMsg: Message = {
      id: crypto.randomUUID(),
      role: "system",
      content: `Started watching: ${videoTitle ?? videoId}`,
      videoId,
    };

    fetch(`/api/projects/${projectId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role: "system",
        content: systemMsg.content,
        videoId,
      }),
    })
      .then((r) => r.json())
      .then((saved) => setMessages((prev) => [...prev, saved]));
  }, [videoId, videoTitle, projectId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  // Selection-based "Copy to notebook" popup
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
    prevVideoIdRef.current = null;
    setChatStarted(false);
    setSuggestions(null);
  }

  function buildHistory(): HistoryMessage[] {
    return messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
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

  async function startConversation() {
    setChatStarted(true);
    await fetchSuggestions();
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
    });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Chat</span>
        <div className="flex items-center gap-2">
          {chatStarted && (
            <button
              onClick={fetchSuggestions}
              disabled={loadingSuggestions || !videoId}
              className="text-xs px-2 py-1 rounded-full border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500 dark:hover:text-blue-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Refresh suggestions"
            >
              {loadingSuggestions ? "…" : "Suggest"}
            </button>
          )}
          <button
            onClick={clearChat}
            disabled={messages.length === 0}
            className="text-xs px-2 py-1 rounded-full border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-red-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Clear all messages"
          >
            Clear
          </button>
          <button
            onClick={() => setVideoOnly((v) => !v)}
            disabled={!videoId}
            className={`text-xs px-2 py-1 rounded-full border transition-colors ${
              videoOnly
                ? "bg-blue-100 dark:bg-blue-900 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
                : "border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
            title={videoOnly ? "Strictly using video content only" : "Using video + general knowledge"}
          >
            {videoOnly ? "Video only" : "Open knowledge"}
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
            top: selectionPopup.y - 36,
            transform: "translateX(-50%)",
          }}
          className="z-50 bg-blue-600 hover:bg-blue-700 text-white text-xs px-2.5 py-1 rounded shadow-lg whitespace-nowrap"
        >
          Copy to notebook
        </button>
      )}

      {/* Messages */}
      <div
        ref={messagesRef}
        onMouseUp={handleMessagesMouseUp}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-3"
      >
        {/* Start conversation button — shown when video loaded but chat not started */}
        {!chatStarted && videoId && messages.filter((m) => m.role !== "system").length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 mt-8">
            <p className="text-sm text-gray-400 text-center">
              Ready to explore this video with AI
            </p>
            <button
              onClick={startConversation}
              disabled={loadingSuggestions}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {loadingSuggestions ? "Loading suggestions…" : "Start conversation"}
            </button>
          </div>
        )}

        {/* Default placeholder — no video loaded */}
        {!videoId && messages.length === 0 && (
          <p className="text-sm text-gray-400 text-center mt-8">
            Ask anything — load a video to discuss it
          </p>
        )}

        {messages.map((msg) => (
          <div key={msg.id}>
            {msg.role === "system" ? (
              <div className="flex justify-center">
                <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                  {msg.content}
                </span>
              </div>
            ) : (
              <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white whitespace-pre-wrap"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <>
                      <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-pre:my-2 prose-pre:bg-gray-200 dark:prose-pre:bg-gray-700 prose-code:text-pink-600 dark:prose-code:text-pink-400 prose-code:before:content-none prose-code:after:content-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                      {streaming && msg.content === "" && (
                        <span className="inline-block w-2 h-3 bg-gray-400 animate-pulse rounded-sm" />
                      )}
                    </>
                  ) : (
                    msg.content
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
        <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-800 shrink-0">
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => setInput(s)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors text-left"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading suggestions spinner */}
      {loadingSuggestions && chatStarted && (
        <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-800 shrink-0">
          <p className="text-xs text-gray-400 text-center animate-pulse">Generating suggestions…</p>
        </div>
      )}

      {/* Input */}
      <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-800 shrink-0">
        <div className="flex gap-2">
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
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={sendMessage}
            disabled={streaming || !input.trim()}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm transition-colors self-end"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
