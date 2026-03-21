"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { PROMPT_DEFAULTS, PromptKey } from "@/lib/settings";

type SettingsRow = Record<string, string | null | undefined>;

interface Props {
  initialSettings: SettingsRow;
  defaults: typeof PROMPT_DEFAULTS;
}

type Section = "api-keys" | "prompts";

// ── Prompt key groupings ────────────────────────────────────────────────────

const CHAT_KEYS: PromptKey[] = [
  "chatSystemPrompt",
  "chatVideoOnlyPrompt",
  "chatGeneralPrompt",
];
const SUGGEST_KEYS: PromptKey[] = [
  "suggestFreshNoChapter",
  "suggestFreshWithChapter",
  "suggestHistoryWithChapter",
  "suggestHistoryNoChapter",
];
const CHAPTER_KEYS: PromptKey[] = ["chaptersSystemPrompt", "chaptersUserPrompt"];


const PROMPT_LABELS: Record<PromptKey, string> = {
  chatSystemPrompt: "System Prompt",
  chatVideoOnlyPrompt: "Video-Only Mode",
  chatGeneralPrompt: "General Knowledge Mode",
  suggestFreshNoChapter: "Fresh Start — no chapter",
  suggestFreshWithChapter: "Fresh Start — with chapter",
  suggestHistoryWithChapter: "With History & Chapter",
  suggestHistoryNoChapter: "With History, No Chapter",
  chaptersSystemPrompt: "System Prompt",
  chaptersUserPrompt: "User Instruction",
};

const PROMPT_DESCRIPTIONS: Record<PromptKey, string> = {
  chatSystemPrompt:
    "The base role instruction prepended to every chat session. Sets tone, behaviour, and persona.",
  chatVideoOnlyPrompt:
    "Injected when 'Video only' mode is on. Should constrain Claude to the transcript only.",
  chatGeneralPrompt:
    "Injected when general mode is on. Permits Claude to draw on broader knowledge.",
  suggestFreshNoChapter:
    "Used to generate opening questions when no chapter is active yet.",
  suggestFreshWithChapter:
    "Opening questions when a chapter is active. Available placeholder: {{CHAPTER}}",
  suggestHistoryWithChapter:
    "Follow-up questions with chat history and an active chapter. Placeholders: {{CHAPTER}}, {{TIME}}",
  suggestHistoryNoChapter:
    "Follow-up questions with chat history, no chapter. Available placeholder: {{TIME}}",
  chaptersSystemPrompt:
    "System role for the chapter-generation call. Should enforce strict JSON output.",
  chaptersUserPrompt:
    "The task instruction asking Claude to produce chapters from the transcript.",
};

const HAS_PLACEHOLDERS: Partial<Record<PromptKey, true>> = {
  suggestFreshWithChapter: true,
  suggestHistoryWithChapter: true,
  suggestHistoryNoChapter: true,
};

// ── Icons ───────────────────────────────────────────────────────────────────

function IconKey() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="m21 2-9.6 9.6" />
      <path d="m15.5 7.5 3 3L22 7l-3-3" />
    </svg>
  );
}

function IconChat() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconLightbulb() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </svg>
  );
}

function IconChapters() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function IconWarn() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function IconEye({ open }: { open: boolean }) {
  return open ? (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function SettingsForm({ initialSettings, defaults }: Props) {
  const [form, setForm] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const key of ["anthropicApiKey", "youtubeApiKey"]) {
      initial[key] = (initialSettings[key] as string) ?? "";
    }
    for (const key of Object.keys(defaults) as PromptKey[]) {
      // Show the saved override, or the built-in default so it's editable
      initial[key] = (initialSettings[key] as string) || defaults[key];
    }
    return initial;
  });

  const router = useRouter();
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showYoutubeKey, setShowYoutubeKey] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [activeSection, setActiveSection] = useState<Section>("api-keys");
  const totalOverrides = customizedCount([...CHAT_KEYS, ...SUGGEST_KEYS, ...CHAPTER_KEYS]);
  const contentRef = useRef<HTMLDivElement>(null);

  function set(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (status === "saved" || status === "error") setStatus("idle");
  }

  function resetPrompt(key: PromptKey) {
    set(key, defaults[key]);
  }

  function isCustomized(key: PromptKey) {
    return (form[key] ?? "").trim() !== defaults[key].trim();
  }

  function customizedCount(keys: PromptKey[]) {
    return keys.filter((k) => isCustomized(k)).length;
  }

  async function save() {
    setStatus("saving");
    try {
      // For prompt keys, send "" when the value matches the default so the
      // server falls back to the built-in default rather than storing a copy.
      const payload: Record<string, string> = { ...form };
      for (const key of Object.keys(defaults) as PromptKey[]) {
        if ((payload[key] ?? "").trim() === defaults[key].trim()) {
          payload[key] = "";
        }
      }
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Save failed");
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  // Scroll content to top when section changes
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [activeSection]);

  const navItems: { id: Section; label: string; sub: string; icon: React.ReactNode; badge?: number; danger?: boolean }[] = [
    {
      id: "api-keys",
      label: "API Keys",
      sub: "Service credentials",
      icon: <IconKey />,
    },
    {
      id: "prompts",
      label: "Prompt Overrides",
      sub: "Advanced — modify with care",
      icon: <IconWarn />,
      badge: totalOverrides || undefined,
      danger: true,
    },
  ];

  return (
    <div className="flex h-full">
      {/* ── Left sidebar nav ─────────────────────────────── */}
      <aside className="w-52 shrink-0 border-r border-gray-200 dark:border-gray-800 px-2 py-6 flex flex-col gap-0.5">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 px-3 py-2 mb-3 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/60 w-full"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        {navItems.map((item) => {
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`
                group w-full text-left px-3 py-2.5 rounded-lg transition-all duration-100
                flex items-start gap-3
                ${active
                  ? item.danger
                    ? "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300"
                    : "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/60 hover:text-gray-900 dark:hover:text-gray-200"
                }
              `}
            >
              <span className={`mt-0.5 shrink-0 ${
                active
                  ? item.danger ? "text-red-500 dark:text-red-400" : "text-blue-600 dark:text-blue-400"
                  : "text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400"
              }`}>
                {item.icon}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium leading-tight">
                  {item.label}
                </span>
                <span className={`block text-[11px] mt-0.5 leading-tight ${
                  active
                    ? item.danger ? "text-red-400 dark:text-red-500" : "text-blue-500 dark:text-blue-400"
                    : "text-gray-400 dark:text-gray-500"
                }`}>
                  {item.sub}
                </span>
              </span>
              {item.badge != null && (
                <span className="shrink-0 mt-0.5 text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 rounded-full px-1.5 py-0.5 leading-tight">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}

        {/* Spacer + save button pinned to bottom of nav */}
        <div className="flex-1" />
        <div className="px-3 pt-4 border-t border-gray-200 dark:border-gray-800 mt-4">
          <button
            onClick={save}
            disabled={status === "saving"}
            className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium transition-colors"
          >
            {status === "saving" ? "Saving…" : "Save"}
          </button>
          <div className="h-5 mt-1.5 text-center">
            {status === "saved" && (
              <span className="text-[11px] text-green-600 dark:text-green-400">Changes saved</span>
            )}
            {status === "error" && (
              <span className="text-[11px] text-red-500 dark:text-red-400">Error — try again</span>
            )}
          </div>
        </div>
      </aside>

      {/* ── Right content area ───────────────────────────── */}
      <div ref={contentRef} className="flex-1 overflow-y-auto">
        <div className="max-w-2xl px-8 py-8">
          {activeSection === "api-keys" && <ApiKeysSection form={form} set={set} showAnthropicKey={showAnthropicKey} setShowAnthropicKey={setShowAnthropicKey} showYoutubeKey={showYoutubeKey} setShowYoutubeKey={setShowYoutubeKey} />}
          {activeSection === "prompts" && (
            <div className="space-y-10">
              {/* Danger callout */}
              <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-5 py-4 space-y-1">
                <p className="text-sm font-semibold text-red-700 dark:text-red-400">These are advanced settings</p>
                <p className="text-sm text-red-600 dark:text-red-500">
                  Modifying these prompts changes how Claude behaves across the entire app. A bad prompt can break chat, suggestions, or chapter generation. Leave any field at its default unless you know what you&apos;re doing. You can always reset individual prompts to their built-in default.
                </p>
              </div>
              <PromptSection title="Chat" description="Controls how Claude responds in the chat panel — its persona, scope, and how it handles video-only vs. general knowledge mode." keys={CHAT_KEYS} form={form} defaults={defaults} set={set} resetPrompt={resetPrompt} isCustomized={isCustomized} />
              <PromptSection title="Suggestions" description="Controls the question suggestions shown at the start of and during a conversation. Use the {{CHAPTER}} and {{TIME}} placeholders where noted." keys={SUGGEST_KEYS} form={form} defaults={defaults} set={set} resetPrompt={resetPrompt} isCustomized={isCustomized} />
              <PromptSection title="Chapters" description="Controls how Claude auto-generates chapter markers from the transcript. The output must remain valid JSON — be especially careful if you modify the user instruction." keys={CHAPTER_KEYS} form={form} defaults={defaults} set={set} resetPrompt={resetPrompt} isCustomized={isCustomized} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── API Keys section ─────────────────────────────────────────────────────────

interface ApiKeysSectionProps {
  form: Record<string, string>;
  set: (key: string, value: string) => void;
  showAnthropicKey: boolean;
  setShowAnthropicKey: (v: boolean | ((p: boolean) => boolean)) => void;
  showYoutubeKey: boolean;
  setShowYoutubeKey: (v: boolean | ((p: boolean) => boolean)) => void;
}

function ApiKeysSection({
  form, set,
  showAnthropicKey, setShowAnthropicKey,
  showYoutubeKey, setShowYoutubeKey,
}: ApiKeysSectionProps) {
  return (
    <div className="space-y-8">
      <SectionHeader
        title="API Keys"
        description="Your service credentials are stored locally and are never shared. Leave a field blank to fall back to the corresponding environment variable."
      />

      <FieldCard>
        <KeyField
          label="Anthropic API Key"
          placeholder="sk-ant-…"
          helpText={
            <>
              Required for all AI features. Get yours at{" "}
              <code className="font-mono text-[11px] bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">console.anthropic.com → API Keys</code>
            </>
          }
          value={form.anthropicApiKey}
          show={showAnthropicKey}
          onChange={(v) => set("anthropicApiKey", v)}
          onToggle={() => setShowAnthropicKey((p) => !p)}
        />
      </FieldCard>

      <FieldCard>
        <KeyField
          label={
            <span>
              YouTube Data API Key{" "}
              <span className="font-normal text-gray-400 dark:text-gray-500">— optional</span>
            </span>
          }
          placeholder="AIza…"
          helpText={
            <>
              Only used for fetching video titles. Get yours at{" "}
              <code className="font-mono text-[11px] bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">console.cloud.google.com</code>
            </>
          }
          value={form.youtubeApiKey}
          show={showYoutubeKey}
          onChange={(v) => set("youtubeApiKey", v)}
          onToggle={() => setShowYoutubeKey((p) => !p)}
        />
      </FieldCard>
    </div>
  );
}

// ── Prompt section ───────────────────────────────────────────────────────────

interface PromptSectionProps {
  title: string;
  description: string;
  keys: PromptKey[];
  form: Record<string, string>;
  defaults: typeof PROMPT_DEFAULTS;
  set: (key: string, value: string) => void;
  resetPrompt: (key: PromptKey) => void;
  isCustomized: (key: PromptKey) => boolean;
}

function PromptSection({ title, description, keys, form, defaults, set, resetPrompt, isCustomized }: PromptSectionProps) {
  return (
    <div className="space-y-6">
      <SectionHeader title={title} description={description} />

      <div className="space-y-5">
        {keys.map((key) => {
          const customized = isCustomized(key);
          const hasPlaceholder = key in HAS_PLACEHOLDERS;
          return (
            <FieldCard key={key}>
              <div className="space-y-2">
                {/* Label row */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <label className="block text-sm font-medium text-gray-800 dark:text-gray-200">
                      {PROMPT_LABELS[key]}
                    </label>
                    {customized ? (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 leading-tight">
                        overridden
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 leading-tight">
                        default
                      </span>
                    )}
                  </div>
                  {customized && (
                    <button
                      type="button"
                      onClick={() => resetPrompt(key)}
                      className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors shrink-0"
                    >
                      Reset to default
                    </button>
                  )}
                </div>

                {/* Description */}
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  {PROMPT_DESCRIPTIONS[key]}
                </p>

                {/* Placeholder hint */}
                {hasPlaceholder && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-gray-400 dark:text-gray-500">Available:</span>
                    {["suggestFreshWithChapter", "suggestHistoryWithChapter"].includes(key) && (
                      <PlaceholderPill text="{{CHAPTER}}" />
                    )}
                    {["suggestHistoryWithChapter", "suggestHistoryNoChapter"].includes(key) && (
                      <PlaceholderPill text="{{TIME}}" />
                    )}
                  </div>
                )}

                {/* Textarea */}
                <textarea
                  rows={5}
                  value={form[key]}
                  onChange={(e) => set(key, e.target.value)}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/60 px-3 py-2.5 text-[13px] text-gray-900 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y font-mono leading-relaxed"
                />
              </div>
            </FieldCard>
          );
        })}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-1.5 pb-2 border-b border-gray-200 dark:border-gray-800">
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{description}</p>
    </div>
  );
}

function FieldCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950/50 px-5 py-4">
      {children}
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-[11px] bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
      {children}
    </code>
  );
}

function PlaceholderPill({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center font-mono text-[11px] bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded px-1.5 py-0.5">
      {text}
    </span>
  );
}

interface KeyFieldProps {
  label: React.ReactNode;
  placeholder: string;
  helpText: React.ReactNode;
  value: string;
  show: boolean;
  onChange: (v: string) => void;
  onToggle: () => void;
}

function KeyField({ label, placeholder, helpText, value, show, onChange, onToggle }: KeyFieldProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-800 dark:text-gray-200">{label}</label>
      <div className="flex gap-2">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/60 px-3 py-2 text-sm font-mono text-gray-900 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          type="button"
          onClick={onToggle}
          title={show ? "Hide key" : "Reveal key"}
          className="px-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <IconEye open={show} />
        </button>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{helpText}</p>
    </div>
  );
}
