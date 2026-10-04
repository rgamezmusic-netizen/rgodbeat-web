"use client";

import { useState } from "react";

type CheckState = { kind: "success" | "error"; message: string } | null;

export default function R2ConnectionCheck() {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckState>(null);

  async function checkConnection() {
    setChecking(true);
    setResult(null);
    try {
      const response = await fetch("/api/admin/youtube/r2-check", { method: "POST", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      setResult({
        kind: response.ok && data.success ? "success" : "error",
        message: data.message || data.error || "No se pudo comprobar R2.",
      });
    } catch {
      setResult({ kind: "error", message: "No se pudo conectar con el servidor." });
    } finally {
      setChecking(false);
    }
  }

  return <div className="space-y-3">
    <button type="button" onClick={checkConnection} disabled={checking} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white hover:border-amber-300/60 hover:text-amber-200 disabled:cursor-wait disabled:opacity-60">
      {checking ? "Comprobando R2…" : "Comprobar conexión R2"}
    </button>
    {result && <p role="status" className={`text-sm ${result.kind === "success" ? "text-emerald-300" : "text-red-300"}`}>{result.message}</p>}
  </div>;
}
