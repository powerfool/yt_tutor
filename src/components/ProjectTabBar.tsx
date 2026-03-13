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
    <div className="flex items-center gap-1 px-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 overflow-x-auto shrink-0">
      {projects.map((project) => (
        <div
          key={project.id}
          onClick={() => router.push(`/project/${project.id}`)}
          onDoubleClick={() => startEditing(project)}
          className={`
            flex items-center px-3 py-2 text-sm rounded-t cursor-pointer select-none whitespace-nowrap
            ${
              activeId === project.id
                ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-medium"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
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
              className="bg-white dark:bg-gray-700 border border-blue-400 rounded px-1 w-32 text-sm focus:outline-none text-gray-900 dark:text-gray-100"
            />
          ) : (
            project.name
          )}
        </div>
      ))}

      <button
        onClick={createProject}
        className="px-2 py-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none shrink-0"
        title="New project"
      >
        +
      </button>
    </div>
  );
}
