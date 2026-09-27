'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck, FolderKanban, FileText, CheckCircle2, UserCircle2, ArrowLeft } from 'lucide-react';

export function ParkNav() {
  const pathname = usePathname() || '';

  const navItems = [
    { label: 'Control Center', href: '/park', icon: ShieldCheck, exact: true },
    { label: 'Catálogo', href: '/park/catalog', icon: FolderKanban },
    { label: 'Centro de Registro', href: '/park/registrations', icon: CheckCircle2 },
    { label: 'Documentos', href: '/park/documents', icon: FileText },
    { label: 'Master Profile', href: '/park/profile', icon: UserCircle2 },
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#08080c]/95 backdrop-blur-xl border-b border-zinc-800/80 px-4 sm:px-8 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Left: Brand Identity */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-zinc-500 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-zinc-800/60"
            title="Volver a la tienda principal"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>

          <Link href="/park" className="flex items-center gap-2 group">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
            <div className="flex flex-col">
              <span className="text-sm font-black font-display tracking-[0.16em] text-white uppercase group-hover:text-cyan-300 transition-colors">
                THE PARK
              </span>
              <span className="text-[9px] font-mono tracking-wider text-zinc-500 uppercase -mt-0.5">
                Master Rights & Release
              </span>
            </div>
          </Link>
        </div>

        {/* Center: Main Navigation Links */}
        <nav className="hidden md:flex items-center gap-1.5 bg-zinc-900/80 p-1 rounded-xl border border-zinc-800/80">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition-all ${
                  isActive
                    ? 'bg-cyan-500 text-black shadow-md shadow-cyan-500/20 font-black'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right: Quick Link to Studio or Account */}
        <div className="flex items-center gap-2">
          <Link
            href="/studio"
            className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 font-mono text-xs font-bold transition-all flex items-center gap-1.5"
            title="Ir a RGodbeat Studio DAW"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span>STUDIO DAW</span>
          </Link>
        </div>
      </div>

      {/* Mobile Horizontal Sub-bar */}
      <div className="md:hidden flex items-center gap-1 pt-2.5 overflow-x-auto no-scrollbar">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold flex items-center gap-1.5 transition-all ${
                isActive
                  ? 'bg-cyan-500 text-black font-black'
                  : 'text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800'
              }`}
            >
              <Icon className="w-3 h-3" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </header>
  );
}
