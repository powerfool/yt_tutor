"use client";

import { useState, useEffect } from "react";

type Props = {
  onClose: () => void;
};

function IconEye({ open }: { open: boolean }) {
  return open ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export default function SettingsPanel({ onClose }: Props) {
  const [anthropicKey, setAnthropicKey] = useState("");
  const [anthropicConfigured, setAnthropicConfigured] = useState(false);
  const [anthropicEditing, setAnthropicEditing] = useState(false);
  const [showAnthropic, setShowAnthropic] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    chrome.storage.local.get("anthropicApiKey", (result) => {
      if (result.anthropicApiKey) {
        setAnthropicConfigured(true);
        setAnthropicEditing(false);
      } else {
        setAnthropicEditing(true);
      }
    });
  }, []);

  async function save() {
    setStatus("saving");
    try {
      if (anthropicEditing && anthropicKey.trim()) {
        await chrome.storage.local.set({ anthropicApiKey: anthropicKey.trim() });
        setAnthropicConfigured(true);
        setAnthropicEditing(false);
        setAnthropicKey("");
      }
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  async function clearAnthropicKey() {
    await chrome.storage.local.remove("anthropicApiKey");
    setAnthropicConfigured(false);
    setAnthropicEditing(true);
    setAnthropicKey("");
    setStatus("idle");
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-10 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <span className="text-[11px] font-semibold tracking-widest uppercase text-gray-500 dark:text-gray-400">Settings</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onClose}
            className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            ← Back
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-5">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-800 dark:text-gray-200">
            Anthropic API Key
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            Required for AI chat. Get yours at{" "}
            <code className="font-mono text-[11px] bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
              console.anthropic.com → API Keys
            </code>
            . Stored locally in your browser only.
          </p>
          {anthropicConfigured && !anthropicEditing ? (
            <div className="flex gap-2 items-center">
              <div className="flex-1 flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/60 px-3 py-2">
                <span className="text-sm font-mono text-gray-400 dark:text-gray-500 tracking-widest select-none">
                  ••••••••••••••••
                </span>
                <span className="ml-auto text-[11px] font-medium text-green-600 dark:text-green-400">
                  Configured
                </span>
              </div>
              <button
                onClick={() => setAnthropicEditing(true)}
                className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Change
              </button>
              <button
                onClick={clearAnthropicKey}
                className="px-3 py-2 rounded-lg border border-red-200 dark:border-red-900 text-sm text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
              >
                Clear
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type={showAnthropic ? "text" : "password"}
                value={anthropicKey}
                onChange={(e) => { setAnthropicKey(e.target.value); setStatus("idle"); }}
                placeholder="sk-ant-…"
                autoFocus={anthropicEditing && !anthropicConfigured}
                className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/60 px-3 py-2 text-sm font-mono text-gray-900 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setShowAnthropic((p) => !p)}
                className="px-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <IconEye open={showAnthropic} />
              </button>
              {anthropicConfigured && (
                <button
                  onClick={() => { setAnthropicEditing(false); setAnthropicKey(""); }}
                  className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Save footer */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 shrink-0 flex items-center gap-3">
        <button
          onClick={save}
          disabled={status === "saving" || (!anthropicEditing || !anthropicKey.trim())}
          className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          {status === "saving" ? "Saving…" : "Save"}
        </button>
        {status === "saved" && (
          <span className="text-[11px] text-green-600 dark:text-green-400 shrink-0">Saved</span>
        )}
        {status === "error" && (
          <span className="text-[11px] text-red-500 dark:text-red-400 shrink-0">Error</span>
        )}
      </div>
    </div>
  );
}
