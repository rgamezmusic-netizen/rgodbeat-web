"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAppInstallation } from "@/hooks/useAppInstallation";
import { rememberInstallGuide } from "@/lib/browser/install-guide";
import styles from "./Hero.module.css";

const InstallAppModal = dynamic(() => import("@/components/studio/InstallAppModal").then(mod => mod.InstallAppModal));

export function InstallStudioButton() {
  const router = useRouter();
  const installation = useAppInstallation();
  const [showGuide, setShowGuide] = useState(false);
  const [guideWasOpened, setGuideWasOpened] = useState(false);
  if (showGuide && !guideWasOpened) setGuideWasOpened(true);

  if (installation.isInstalled) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          // Browsers that support a native prompt require it to be called
          // directly from this user gesture. Apple browsers show the guide.
          if (installation.canInstall) {
            void installation.requestInstall().then(outcome => {
              if (outcome === 'accepted') {
                rememberInstallGuide();
                router.push('/studio');
              } else if (outcome === 'dismissed' || outcome === 'error') setShowGuide(true);
            });
          }
          else setShowGuide(true);
        }}
        disabled={installation.isPrompting}
        aria-label="Instalar RGODBEAT Studio"
        className={`${styles.action} ${styles.installActionButton}`}
      >
        <Download aria-hidden="true" size={18} />
        <span>{installation.isPrompting ? "CONFIRMA INSTALACIÓN" : "INSTALAR STUDIO"}</span>
      </button>
      {guideWasOpened && <InstallAppModal isOpen={showGuide} onClose={() => {
        setShowGuide(false);
        router.push('/studio');
      }} />}
    </>
  );
}
