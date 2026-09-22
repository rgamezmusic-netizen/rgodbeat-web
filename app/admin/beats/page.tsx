import React from "react";
import { getAllBeats } from "@/lib/data/beats";
import { getCategories } from "@/lib/data/categories";
import { AdminBeatsTable } from "@/components/admin/AdminBeatsTable";

export const dynamic = "force-dynamic";

export default async function AdminBeatsPage() {
  const [beats, categories] = await Promise.all([
    getAllBeats(),
    getCategories(),
  ]);

  return (
    <AdminBeatsTable
      initialBeats={beats}
      categories={categories}
    />
  );
}
