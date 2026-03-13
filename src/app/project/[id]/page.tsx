import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import ProjectTabBar from "@/components/ProjectTabBar";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) notFound();

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <ProjectTabBar />

      {/* URL bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
        <input
          type="text"
          placeholder="Paste a YouTube URL…"
          className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Three-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Video */}
        <div className="flex flex-col w-[40%] border-r border-gray-200 dark:border-gray-800">
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Video player
          </div>
        </div>

        {/* Center: Chat */}
        <div className="flex flex-col w-[35%] border-r border-gray-200 dark:border-gray-800">
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            AI chat
          </div>
        </div>

        {/* Right: Notebook */}
        <div className="flex flex-col flex-1">
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Notebook
          </div>
        </div>
      </div>
    </div>
  );
}
