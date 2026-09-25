import React from "react";
import Link from "next/link";
import { requireAdminAuth, signOutAdmin } from "@/lib/auth/server";
import { AdminNav } from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side route guard: redirects to /login if unauthenticated
  const user = await requireAdminAuth("/admin");

  return (
    <div className="min-h-screen bg-[#08080a] text-white flex flex-col selection:bg-purple-500/30 selection:text-white">
      {/* Top Admin Bar */}
      <header
        style={{ paddingTop: "max(12px, calc(env(safe-area-inset-top, 0px) + 8px))" }}
        className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#09090e]/95 backdrop-blur-md px-4 sm:px-6 lg:px-8 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="flex items-center justify-between sm:justify-start gap-6">
          <Link href="/admin" className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-extrabold tracking-tight text-white uppercase text-sm">
              RGODBEAT
            </span>
            <span className="px-1.5 py-0.5 rounded bg-purple-500/20 border border-purple-500/30 text-[10px] font-mono text-purple-300 font-bold uppercase tracking-wider">
              ADMIN CMS
            </span>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:block">
            <AdminNav />
          </div>
        </div>

        {/* Mobile Nav Row */}
        <div className="md:hidden border-t border-white/[0.06] pt-2">
          <AdminNav />
        </div>

        {/* Admin Identity & Actions */}
        <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t border-white/[0.06] sm:border-t-0">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
            <span className="text-zinc-400 hidden lg:inline">USER:</span>
            <span className="text-zinc-200 truncate max-w-[160px] sm:max-w-[200px]">{user.email}</span>
          </div>

          <Link
            href="/beats"
            target="_blank"
            className="hidden sm:inline-flex text-xs font-mono text-zinc-400 hover:text-white transition-colors tracking-wider uppercase px-2.5 py-1.5 rounded-lg hover:bg-white/[0.03]"
          >
            VIEW STORE ↗
          </Link>

          {/* Logout Form Action */}
          <form action={signOutAdmin}>
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-300 border border-white/[0.08] text-xs font-mono tracking-wider uppercase text-zinc-300 transition-all cursor-pointer"
            >
              LOGOUT
            </button>
          </form>
        </div>
      </header>

      {/* Main Admin Content Container */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {children}
      </main>
    </div>
  );
}
