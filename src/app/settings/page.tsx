import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PROMPT_DEFAULTS } from "@/lib/settings";
import ProjectTabBar from "@/components/ProjectTabBar";
import SettingsForm from "@/components/SettingsForm";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const settings = await prisma.userSettings.findUnique({ where: { userId: session.user.id } });
  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-950">
      <ProjectTabBar />
      <div className="flex-1 overflow-hidden">
        <SettingsForm initialSettings={settings ?? {}} defaults={PROMPT_DEFAULTS} />
      </div>
    </div>
  );
}
