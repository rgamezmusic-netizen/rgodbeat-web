import React from "react";
import { Metadata } from "next";
import Link from "next/link";
import { getCategories } from "@/lib/data/categories";
import { getLicenseTypes } from "@/lib/data/licenses";
import { NewBeatForm } from "@/components/admin/NewBeatForm";

export const metadata: Metadata = {
  title: "Upload New Beat | RGODBEAT Admin",
  description: "Create and publish a new beat with audio masters and multi-tier licensing.",
};

export const dynamic = "force-dynamic";

export default async function NewBeatPage() {
  const [categories, licenseTypes] = await Promise.all([
    getCategories(),
    getLicenseTypes(),
  ]);

  return (
    <div className="space-y-8">
      {/* Top Header / Breadcrumb */}
      <div>
        <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 uppercase tracking-widest mb-2">
          <Link href="/admin" className="hover:text-amber-400 transition-colors">
            Admin
          </Link>
          <span>/</span>
          <Link href="/admin/beats" className="hover:text-amber-400 transition-colors">
            Beats
          </Link>
          <span>/</span>
          <span className="text-zinc-300">New Release</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-sans">
          Upload New Beat
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Add audio files, artwork, and configure pricing tiers for your store catalog.
        </p>
      </div>

      {/* Main Upload / Configuration Form */}
      <NewBeatForm categories={categories} licenseTypes={licenseTypes} />
    </div>
  );
}
