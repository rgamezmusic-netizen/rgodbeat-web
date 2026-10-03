import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function CheckoutCancelPage() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4 py-16">
      <div className="max-w-md w-full bg-[#0e0e13] border border-white/[0.08] p-8 sm:p-10 rounded-2xl space-y-6 shadow-2xl">
        <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 mx-auto flex items-center justify-center">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>

        <div className="space-y-2">
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            PAGO CANCELADO
          </h1>
          <p className="text-sm text-zinc-400">
            No se completó la transacción y no se realizó ningún cargo. Puedes volver a intentarlo desde tu carrito.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row gap-3">
          <Button href="/beats" variant="primary" size="md" className="w-full justify-center">
            VOLVER A LOS BEATS
          </Button>
        </div>
      </div>
    </div>
  );
}
