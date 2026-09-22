import React from "react";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getBeatForEdit } from "@/lib/data/beats";
import { getCategories } from "@/lib/data/categories";
import { getLicenseTypes } from "@/lib/data/licenses";
import { EditBeatForm } from "@/components/admin/EditBeatForm";

export const metadata: Metadata = {
  title: "Edit Beat | RGODBEAT Admin",
  description: "Edit beat metadata, manage assets, and update license tiers.",
};

export const dynamic = "force-dynamic";

interface EditBeatPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditBeatPage({ params }: EditBeatPageProps) {
  const { id } = await params;

  const [beat, categories, licenseTypes] = await Promise.all([
    getBeatForEdit(id),
    getCategories(),
    getLicenseTypes(),
  ]);

  if (!beat) {
    notFound();
  }

  return (
    <div className="space-y-8">
      {/* Breadcrumb Header */}
      <div>
        <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 uppercase tracking-widest mb-2">
          <Link href="/admin" className="hover:text-purple-400 transition-colors">
            Admin
          </Link>
          <span>/</span>
          <Link href="/admin/beats" className="hover:text-purple-400 transition-colors">
            Beats
          </Link>
          <span>/</span>
          <span className="text-zinc-300">Edit Release</span>
        </div>
      </div>

      {/* Main Edit Form */}
      <EditBeatForm beat={beat} categories={categories} licenseTypes={licenseTypes} />
    </div>
  );
}
