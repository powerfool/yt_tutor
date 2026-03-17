import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import ProjectTabBar from "@/components/ProjectTabBar";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const first = await prisma.project.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });
  if (first) redirect(`/project/${first.id}`);

  // No projects yet — show empty state with tab bar
  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <ProjectTabBar />
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        Click <span className="mx-1 font-bold text-lg leading-none">+</span> to create your first project.
      </div>
    </div>
  );
}
