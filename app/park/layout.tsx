import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function ParkLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login?redirect=%2Fpark");
  }

  return children;
}
