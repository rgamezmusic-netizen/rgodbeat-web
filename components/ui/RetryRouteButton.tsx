"use client";

import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export function RetryRouteButton({ children, className }: { children: ReactNode; className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <button type="button" className={className} disabled={pending} aria-busy={pending}
    onClick={() => startTransition(() => router.refresh())}>
    {pending ? "Reintentando…" : children}
  </button>;
}
