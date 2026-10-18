import Link from "next/link";
import { SpiderMark, SpiderWeb } from "@/components/auth/SpiderWeb";

/**
 * Shared by /login, /register, /forgot-password and /reset-password. Being a layout, it stays
 * mounted between them: the web plays its draw-in once and the tab indicator can slide.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <aside className="auth-panel relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Link
          href="/login"
          className="relative z-10 flex items-center gap-2.5 text-lg font-semibold text-white"
        >
          <SpiderMark />
          Spider
        </Link>
        <SpiderWeb className="pointer-events-none absolute top-1/2 left-1/2 w-[min(108%,760px)] -translate-x-1/2 -translate-y-[60%]" />
        {/* lets the headline sit on clean ink instead of on the threads */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-t from-[#0a0e22] via-[#0a0e22]/85 to-transparent"
        />
        <div className="relative z-10 max-w-md">
          <h2 className="text-[2.6rem] leading-[1.05] font-semibold tracking-[-0.03em] text-white">
            Every site you run,
            <br />
            caught in one web.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-[var(--auth-copy)]">
            Spider reads Search Console for each of your properties and tells
            you what changed, what is slipping and what to fix first.
          </p>
        </div>
      </aside>

      <main className="flex min-h-dvh flex-col px-4 py-8 sm:px-10">
        <Link
          href="/login"
          className="flex items-center gap-2.5 text-lg font-semibold lg:hidden"
        >
          <SpiderMark />
          Spider
        </Link>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <p className="text-center text-xs text-muted">Spider by MISSIRIA</p>
      </main>
    </div>
  );
}
