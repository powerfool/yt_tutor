import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import ProjectTabBar from "@/components/ProjectTabBar";

export default async function HomePage() {
  const session = await auth();

  if (session?.user?.id) {
    const first = await prisma.project.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: "asc" },
    });
    if (first) redirect(`/project/${first.id}`);

    // Authenticated but no projects yet
    return (
      <div className="flex flex-col h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
        <ProjectTabBar />
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Click <span className="mx-1 font-bold text-lg leading-none">+</span> to create your first project.
        </div>
      </div>
    );
  }

  // Unauthenticated — render landing page
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">

      {/* Nav */}
      <nav className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-red-600 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 16 16" fill="white" className="w-3 h-3 ml-0.5">
              <path d="M6 4l6 4-6 4V4z" />
            </svg>
          </div>
          <span className="text-base font-semibold tracking-tight">YT Tutor</span>
        </div>
        <Link
          href="/login"
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
        >
          Sign in
        </Link>
      </nav>

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-16">
        <p className="text-xs font-semibold uppercase tracking-widest text-red-600 mb-4">
          Research &amp; Learning
        </p>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-tight mb-6">
          Turn YouTube videos into<br className="hidden sm:block" /> active learning.
        </h1>
        <p className="text-lg text-gray-500 dark:text-gray-400 leading-relaxed mb-10 max-w-xl">
          Paste a URL. Ask Claude about what you just heard. Build a notebook from the best answers. Your place is saved — come back any time.
        </p>
        <Link
          href="/login"
          className="inline-block bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          Get started
        </Link>
      </section>

      {/* Features */}
      <section className="max-w-3xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">

          {/* Transcript */}
          <div>
            <div className="mb-3 text-red-600">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="4" y1="10" x2="20" y2="10" />
                <line x1="4" y1="14" x2="14" y2="14" />
                <line x1="4" y1="18" x2="11" y2="18" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold mb-1.5">Transcript + chapters</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              Every word, every timestamp. Click any line to jump the player to that moment. Chapters auto-generated if the video doesn&apos;t have them.
            </p>
          </div>

          {/* Chat */}
          <div>
            <div className="mb-3 text-red-600">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold mb-1.5">Ask Claude</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              Claude has the full transcript in context. Ask about something you heard, request a summary, go deeper. Grounded answers — not generic search.
            </p>
          </div>

          {/* Notebook */}
          <div>
            <div className="mb-3 text-red-600">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold mb-1.5">Notebook</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              Hover any AI response to copy it to your notebook with full formatting. Rich text, autosaved, one per project.
            </p>
          </div>

        </div>
      </section>

      {/* Footer */}
      <footer className="max-w-3xl mx-auto px-6 py-5 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-red-600 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 16 16" fill="white" className="w-2.5 h-2.5 ml-0.5">
              <path d="M6 4l6 4-6 4V4z" />
            </svg>
          </div>
          <span className="text-sm font-semibold tracking-tight">YT Tutor</span>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-600">Sign in with Google to get started.</p>
      </footer>

    </div>
  );
}
