"use client";

import { useEffect, useRef, useState } from "react";
import { TranscriptSegment } from "@/lib/youtube";

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  videoId?: string | null;
};

type Props = {
  projectId: string;
  videoId: string | null;
  videoTitle: string | null;
  transcript: TranscriptSegment[] | null;
};

export default function ChatPanel({ projectId, videoId, videoTitle, transcript }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [videoFocus, setVideoFocus] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevVideoIdRef = useRef<string | null>(null);

  // Load existing messages on mount
  useEffect(() => {
    fetch(`/api/projects/${projectId}/messages`)
      .then((r) => r.json())
      .then(setMessages);
  }, [projectId]);

  // Insert system message when video changes
  useEffect(() => {
    if (!videoId || videoId === prevVideoIdRef.current) return;
    prevVideoIdRef.current = videoId;

    const systemMsg: Message = {
      id: crypto.randomUUID(),
      role: "system",
      content: `Started watching: ${videoTitle ?? videoId}`,
      videoId,
    };

    // Persist to DB
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

  async function sendMessage() {
    if (!input.trim() || streaming) return;

    const userText = input.trim();
    setInput("");

    // Optimistically add user message
    const tempId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: tempId, role: "user", content: userText, videoId },
    ]);

    // Persist user message
    fetch(`/api/projects/${projectId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "user", content: userText, videoId }),
    });

    // Stream assistant response
    setStreaming(true);
    const streamId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: streamId, role: "assistant", content: "", videoId },
    ]);

    const history = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userText, history, videoFocus, transcript, videoTitle }),
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

    // Persist assistant message
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
        <button
          onClick={() => setVideoFocus((v) => !v)}
          disabled={!videoId}
          className={`text-xs px-2 py-1 rounded-full border transition-colors ${
            videoFocus
              ? "bg-blue-100 dark:bg-blue-900 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
              : "border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400"
          } disabled:opacity-40 disabled:cursor-not-allowed`}
          title={videoFocus ? "Focused on video transcript" : "Using full Claude knowledge"}
        >
          {videoFocus ? "Video focus on" : "Video focus off"}
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {messages.length === 0 && (
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
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  }`}
                >
                  {msg.content}
                  {streaming && msg.role === "assistant" && msg.content === "" && (
                    <span className="inline-block w-2 h-3 bg-gray-400 animate-pulse rounded-sm" />
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

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
