"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { markdownToTiptapContent } from "@/lib/markdownToTiptap";

type Props = {
  projectId: string;
};

export type NotebookHandle = {
  appendText: (text: string) => void;
  appendMarkdown: (markdown: string) => void;
};

type SaveStatus = "saved" | "saving" | "unsaved";

const NotebookPanel = forwardRef<NotebookHandle, Props>(function NotebookPanel(
  { projectId },
  ref
) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyRef = useRef(false);

  const saveContent = useCallback(
    async (content: object) => {
      setSaveStatus("saving");
      try {
        await fetch(`/api/projects/${projectId}/notebook`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: JSON.stringify(content) }),
        });
        setSaveStatus("saved");
      } catch {
        setSaveStatus("unsaved");
      }
    },
    [projectId]
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit],
    content: "",
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none focus:outline-none px-4 py-4 min-h-full",
      },
    },
    onUpdate: ({ editor }) => {
      if (!readyRef.current) return;
      setSaveStatus("unsaved");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveContent(editor.getJSON());
      }, 800);
    },
  });

  useImperativeHandle(
    ref,
    () => ({
      appendText: (text: string) => {
        if (!editor) return;
        const end = editor.state.doc.content.size;
        editor
          .chain()
          .insertContentAt(end, [{ type: "paragraph", content: [{ type: "text", text }] }])
          .run();
      },
      appendMarkdown: (markdown: string) => {
        if (!editor) return;
        const nodes = markdownToTiptapContent(markdown);
        if (nodes.length === 0) return;
        const existing = editor.getJSON().content ?? [];
        editor.commands.setContent({ type: "doc", content: [...existing, ...nodes] });
      },
    }),
    [editor]
  );

  useEffect(() => {
    if (!editor) return;
    fetch(`/api/projects/${projectId}/notebook`)
      .then((r) => r.json())
      .then(({ content }) => {
        if (content) {
          try {
            const parsed = JSON.parse(content);
            editor.commands.setContent(parsed, { emitUpdate: false });
          } catch {
            // empty or invalid JSON — leave editor blank
          }
        }
        readyRef.current = true;
      })
      .catch(() => {
        readyRef.current = true;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-10 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <span className="text-[11px] font-semibold tracking-widest uppercase text-gray-500 dark:text-gray-400">
          Notebook
        </span>
        <span
          className={`text-[11px] font-mono transition-colors ${
            saveStatus === "saved"
              ? "text-gray-400 dark:text-gray-600"
              : saveStatus === "saving"
              ? "text-blue-400 dark:text-blue-500"
              : "text-amber-500"
          }`}
        >
          {saveStatus === "saved"
            ? "saved"
            : saveStatus === "saving"
            ? "saving…"
            : "unsaved"}
        </span>
      </div>

      {/* Toolbar */}
      {editor && (
        <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-gray-200 dark:border-gray-800 shrink-0 flex-wrap bg-gray-50 dark:bg-gray-900">
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive("bold")}
            title="Bold"
          >
            <strong>B</strong>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive("italic")}
            title="Italic"
          >
            <em>I</em>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            active={editor.isActive("strike")}
            title="Strikethrough"
          >
            <s>S</s>
          </ToolbarButton>
          <div className="w-px h-3.5 bg-gray-200 dark:bg-gray-700 mx-1" />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            active={editor.isActive("heading", { level: 1 })}
            title="Heading 1"
          >
            H1
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor.isActive("heading", { level: 2 })}
            title="Heading 2"
          >
            H2
          </ToolbarButton>
          <div className="w-px h-3.5 bg-gray-200 dark:bg-gray-700 mx-1" />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive("bulletList")}
            title="Bullet list"
          >
            •—
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive("orderedList")}
            title="Ordered list"
          >
            1.
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            active={editor.isActive("blockquote")}
            title="Blockquote"
          >
            ❝
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCode().run()}
            active={editor.isActive("code")}
            title="Inline code"
          >
            `c`
          </ToolbarButton>
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  );
});

export default NotebookPanel;

function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
      className={`px-2 py-1 text-[11px] rounded-md transition-colors font-mono ${
        active
          ? "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300"
          : "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200"
      }`}
    >
      {children}
    </button>
  );
}
