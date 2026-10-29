"use client";

import React, { useEffect, useState } from "react";
import { StudioApp } from "@/components/studio/StudioApp";

export default function StudioPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div
      className="min-h-screen bg-[#09090b] text-white"
      style={{
        minHeight: "100dvh",
        backgroundColor: "#09090b",
        color: "#ffffff",
      }}
    >
      {mounted ? (
        <StudioApp />
      ) : (
        <div
          style={{
            minHeight: "100dvh",
            backgroundColor: "#09090b",
            color: "#fbbf24",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            padding: "16px",
            textAlign: "center",
          }}
        >
          <span
            style={{
              fontSize: "12px",
              letterSpacing: "0.18em",
              fontWeight: 800,
              color: "#fbbf24",
              textTransform: "uppercase",
            }}
          >
            RGODBEAT STUDIO
          </span>
        </div>
      )}
    </div>
  );
}
