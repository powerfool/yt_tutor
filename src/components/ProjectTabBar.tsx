"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams, usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

type Project = { id: string; name: string };

export default function ProjectTabBar() {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const activeId = params?.id as string | undefined;
  const isSettings = pathname === "/settings";

  const [projects, setProjects] = useState<Project[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then(setProjects);
  }, []);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  async function createProject() {
    const res = await fetch("/api/projects", { method: "POST" });
    const project = await res.json();
    setProjects((prev) => [...prev, project]);
    router.push(`/project/${project.id}`);
  }

  function startEditing(project: Project) {
    setEditingId(project.id);
    setEditingName(project.name);
  }

  async function deleteProject(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this project? This cannot be undone.")) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    const remaining = projects.filter((p) => p.id !== id);
    setProjects(remaining);
    if (activeId === id) {
      router.push(remaining.length > 0 ? `/project/${remaining[0].id}` : "/");
    }
  }

  async function commitRename(id: string) {
    const name = editingName.trim();
    setEditingId(null);
    if (!name) return;

    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name } : p))
    );
  }

  return (
    <div className="flex items-end border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shrink-0">
      {/* Scrollable tabs area */}
      <div className="flex items-end gap-0 px-2 min-w-0 flex-1 overflow-x-auto">
        {projects.map((project) => (
          <div
            key={project.id}
            onClick={() => router.push(`/project/${project.id}`)}
            onDoubleClick={() => startEditing(project)}
            style={{ marginBottom: "-1px" }}
            className={`
              group flex items-center gap-1.5 px-3 h-9 text-[13px] cursor-pointer select-none whitespace-nowrap transition-colors border-b-2
              ${
                activeId === project.id
                  ? "border-blue-500 text-gray-900 dark:text-gray-100 font-medium"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600"
              }
            `}
          >
            {editingId === project.id ? (
              <input
                ref={inputRef}
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={() => commitRename(project.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(project.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white dark:bg-gray-700 border border-blue-400 rounded px-1 w-32 text-[13px] focus:outline-none text-gray-900 dark:text-gray-100"
              />
            ) : (
              project.name
            )}
            <button
              onClick={(e) => deleteProject(project.id, e)}
              className="opacity-0 group-hover:opacity-100 ml-0.5 w-4 h-4 flex items-center justify-center rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-gray-200 dark:hover:bg-gray-700 text-xs transition-all leading-none"
              title="Delete project"
            >
              ×
            </button>
          </div>
        ))}

        <button
          onClick={createProject}
          className="ml-1 w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 text-lg leading-none transition-colors shrink-0 mb-1"
          title="New project"
        >
          +
        </button>
      </div>

      {/* Gear button — pinned to right edge, never scrolls */}
      <button
        onClick={() => router.push("/settings")}
        className={`shrink-0 w-7 h-7 mx-1 mb-1 flex items-center justify-center rounded-md transition-colors ${
          isSettings
            ? "text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800"
            : "text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
        }`}
        title="Settings"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
          <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
      </button>

      {/* Logout button */}
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="shrink-0 w-7 h-7 mr-2 mb-1 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        title="Sign out"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </button>
    </div>
  );
}
