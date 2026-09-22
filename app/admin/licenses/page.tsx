import React from "react";
import Link from "next/link";
import { getLicenseTypes } from "@/lib/data/licenses";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminLicensesPage() {
  const licenses = await getLicenseTypes();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            <span className="text-[11px] font-mono tracking-[0.22em] text-purple-400 uppercase">
              COMMERCIAL CONTRACTS & RIGHTS
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white uppercase mt-1">
            License Tiers
          </h1>
          <p className="text-xs text-zinc-400 font-mono mt-0.5">
            {licenses.length} ACTIVE COMMERCIAL CONTRACT TIERS CONFIGURED
          </p>
        </div>

        <div>
          <Link
            href="/admin/beats"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white font-mono text-xs uppercase tracking-wider border border-white/[0.08] transition-all"
          >
            ← BACK TO BEATS
          </Link>
        </div>
      </div>

      {/* Licenses Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {licenses.map((lic, index) => (
          <div
            key={lic.id}
            className="p-6 rounded-2xl bg-[#0e0e14] border border-white/[0.08] hover:border-purple-500/30 transition-all flex flex-col justify-between space-y-4"
          >
            <div>
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  TIER 0{index + 1} // {lic.id}
                </span>
                <span className="text-xl font-mono font-extrabold text-white">
                  {formatCurrency(lic.price)}
                </span>
              </div>

              <div className="mt-3 space-y-1">
                <h3 className="text-base font-bold text-white tracking-tight">
                  {lic.name}
                </h3>
                <p className="text-xs text-purple-300 font-mono">
                  {lic.format}
                </p>
              </div>

              <ul className="mt-4 space-y-2">
                {lic.features.map((feat, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-xs text-zinc-400">
                    <span className="text-purple-400">✓</span>
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="pt-3 border-t border-white/[0.04] flex items-center justify-between text-[10px] font-mono">
              <span className="text-emerald-400 flex items-center gap-1">
                ● ACTIVE TIER
              </span>
              <span className="text-zinc-500">
                ORD: {index + 1}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
