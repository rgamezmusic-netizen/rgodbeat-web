"use client";

import Link from "next/link";
import { Download, Smartphone } from "lucide-react";
import { useState } from "react";
import { InstallAppModal } from "@/components/studio/InstallAppModal";
import { useAppInstallation } from "@/hooks/useAppInstallation";

export function InstallStudioButton() {
  const installation = useAppInstallation();
  const [showGuide, setShowGuide] = useState(false);

  if (installation.isInstalled) {
    return (
      <Link
        href="/studio"
        className="inline-flex min-h-14 w-full min-w-[220px] items-center justify-center gap-2 rounded-full border border-amber-400/50 bg-amber-400/10 px-7 py-3.5 text-sm font-semibold tracking-wide text-amber-200 transition hover:bg-amber-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 sm:w-auto sm:text-base"
      >
        <Smartphone aria-hidden="true" size={18} />
        ABRIR STUDIO
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          // Browsers that support a native prompt require it to be called
          // directly from this user gesture. Apple browsers show the guide.
          if (installation.canInstall) void installation.requestInstall();
          else setShowGuide(true);
        }}
        disabled={installation.isPrompting}
        className="inline-flex min-h-14 w-full min-w-[220px] items-center justify-center gap-2 rounded-full border border-amber-400/50 bg-amber-400/10 px-7 py-3.5 text-sm font-semibold tracking-wide text-amber-200 transition hover:bg-amber-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-60 sm:w-auto sm:text-base"
      >
        <Download aria-hidden="true" size={18} />
        {installation.isPrompting ? "CONFIRMA EN TU DISPOSITIVO…" : "INSTALAR STUDIO"}
      </button>
      <InstallAppModal isOpen={showGuide} onClose={() => setShowGuide(false)} />
    </>
  );
}
