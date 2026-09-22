"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/beats", label: "Beats", exact: false },
  { href: "/admin/categories", label: "Categories", exact: false },
  { href: "/admin/licenses", label: "Licenses", exact: false },
  { href: "/admin/orders", label: "Orders", exact: false },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5">
      {NAV_ITEMS.map((item) => {
        const isActive = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-1.5 rounded-md text-xs font-mono tracking-wider uppercase transition-all whitespace-nowrap ${
              isActive
                ? "bg-white/10 text-white font-bold border border-white/15"
                : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
