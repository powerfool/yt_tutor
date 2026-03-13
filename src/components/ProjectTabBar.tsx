"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";

type Project = { id: string; name: string };

export default function ProjectTabBar() {
  const router = useRouter();
  const params = useParams();
  const activeId = params?.id as string | undefined;

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
    <div className="flex items-end gap-0 px-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 overflow-x-auto shrink-0">
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
  );
}
