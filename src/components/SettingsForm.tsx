"use client";

import { useState } from "react";
import { PROMPT_DEFAULTS, PromptKey } from "@/lib/settings";

type SettingsRow = Record<string, string | null | undefined>;

interface Props {
  initialSettings: SettingsRow;
  defaults: typeof PROMPT_DEFAULTS;
}

const PROMPT_LABELS: Record<PromptKey, string> = {
  chatSystemPrompt: "Chat — System Prompt",
  chatVideoOnlyPrompt: "Chat — Video-Only Instruction",
  chatGeneralPrompt: "Chat — General Knowledge Instruction",
  suggestFreshNoChapter: "Suggest — Fresh Start (no chapter)",
  suggestFreshWithChapter: "Suggest — Fresh Start (with chapter)",
  suggestHistoryWithChapter: "Suggest — With History & Chapter",
  suggestHistoryNoChapter: "Suggest — With History, No Chapter",
  chaptersSystemPrompt: "Chapters — System Prompt",
  chaptersUserPrompt: "Chapters — User Instruction",
};

const SUGGEST_KEYS: PromptKey[] = [
  "suggestFreshNoChapter",
  "suggestFreshWithChapter",
  "suggestHistoryWithChapter",
  "suggestHistoryNoChapter",
];

function hasPlaceholders(key: PromptKey): boolean {
  return SUGGEST_KEYS.includes(key);
}

export default function SettingsForm({ initialSettings, defaults }: Props) {
  const [form, setForm] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const key of ["anthropicApiKey", "youtubeApiKey", ...Object.keys(defaults)]) {
      initial[key] = (initialSettings[key] as string) ?? "";
    }
    return initial;
  });

  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showYoutubeKey, setShowYoutubeKey] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  function set(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (status === "saved" || status === "error") setStatus("idle");
  }

  function resetPrompt(key: PromptKey) {
    set(key, "");
  }

  async function save() {
    setStatus("saving");
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Save failed");
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-10">
      {/* General */}
      <section className="space-y-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">General</h2>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Anthropic API Key
          </label>
          <div className="flex gap-2">
            <input
              type={showAnthropicKey ? "text" : "password"}
              value={form.anthropicApiKey}
              onChange={(e) => set("anthropicApiKey", e.target.value)}
              placeholder="sk-ant-..."
              className="flex-1 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => setShowAnthropicKey((v) => !v)}
              className="px-3 py-2 rounded-md border border-gray-300 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              {showAnthropicKey ? "Hide" : "Show"}
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Get yours at console.anthropic.com → API Keys. Leave blank to use the <code className="font-mono">ANTHROPIC_API_KEY</code> env var.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            YouTube Data API Key{" "}
            <span className="font-normal text-gray-400 dark:text-gray-500">(optional)</span>
          </label>
          <div className="flex gap-2">
            <input
              type={showYoutubeKey ? "text" : "password"}
              value={form.youtubeApiKey}
              onChange={(e) => set("youtubeApiKey", e.target.value)}
              placeholder="AIza..."
              className="flex-1 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => setShowYoutubeKey((v) => !v)}
              className="px-3 py-2 rounded-md border border-gray-300 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              {showYoutubeKey ? "Hide" : "Show"}
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Only needed for fetching video titles. Get at console.cloud.google.com. Leave blank to use the <code className="font-mono">YOUTUBE_API_KEY</code> env var.
          </p>
        </div>
      </section>

      {/* Danger Zone */}
      <section className="space-y-6">
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-5 py-4 space-y-1">
          <h2 className="text-base font-semibold text-red-700 dark:text-red-400">Danger Zone</h2>
          <p className="text-sm text-red-600 dark:text-red-500">
            Override the default prompts sent to Claude. Leave blank to use the built-in defaults.
          </p>
        </div>

        <div className="space-y-6">
          {(Object.keys(PROMPT_LABELS) as PromptKey[]).map((key) => (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {PROMPT_LABELS[key]}
                </label>
                <button
                  type="button"
                  onClick={() => resetPrompt(key)}
                  className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  Reset to default
                </button>
              </div>
              <textarea
                rows={4}
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
                placeholder={defaults[key]}
                className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y font-mono"
              />
              {hasPlaceholders(key) && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Use <code className="font-mono">{"{{CHAPTER}}"}</code> and <code className="font-mono">{"{{TIME}}"}</code> as placeholders.
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Save */}
      <div className="flex items-center gap-4 pb-8">
        <button
          onClick={save}
          disabled={status === "saving"}
          className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium transition-colors"
        >
          {status === "saving" ? "Saving…" : "Save Settings"}
        </button>
        {status === "saved" && (
          <span className="text-sm text-green-600 dark:text-green-400">Saved ✓</span>
        )}
        {status === "error" && (
          <span className="text-sm text-red-600 dark:text-red-400">Error saving. Please try again.</span>
        )}
      </div>
    </div>
  );
}
