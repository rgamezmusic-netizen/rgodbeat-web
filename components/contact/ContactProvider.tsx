"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { contactDestinations } from "@/lib/contact";

type Inquiry = { subject: string; message?: string };
const ContactContext = createContext<((inquiry: Inquiry) => void) | null>(null);

export function ContactProvider({ children }: { children: ReactNode }) {
  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const open = useCallback((next: Inquiry) => setInquiry(next), []);
  const destinations = useMemo(() => inquiry ? contactDestinations(inquiry.subject, inquiry.message || `Hola, quisiera consultar sobre ${inquiry.subject.toLowerCase()}.`) : null, [inquiry]);

  useEffect(() => {
    if (!inquiry) return;
    dialog.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [inquiry]);

  return <ContactContext.Provider value={open}>
    {children}
    <dialog ref={dialog} aria-labelledby={titleId} onClose={() => setInquiry(null)}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close();
      }}
      className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl border border-white/15 bg-[#111116] p-6 text-white shadow-2xl backdrop:bg-black/75 backdrop:backdrop-blur-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <h2 id={titleId} className="text-xl font-bold">¿Cómo prefieres comunicarte?</h2>
        <button type="button" autoFocus aria-label="Cerrar contacto" onClick={() => dialog.current?.close()} className="shrink-0 rounded-lg px-3 py-2 text-zinc-400 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-purple-400">✕</button>
      </div>
      <p className="mb-6 text-sm text-zinc-400">{inquiry?.subject}</p>
      {destinations && <div className="grid gap-3">
        <a href={destinations.email} className="rounded-xl border border-white/20 px-5 py-4 text-center font-semibold hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-purple-400">Correo electrónico</a>
        <a href={destinations.whatsapp} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-emerald-500 px-5 py-4 text-center font-semibold text-black hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-white">WhatsApp</a>
      </div>}
    </dialog>
  </ContactContext.Provider>;
}

type ContactButtonProps = Inquiry & {
  children: ReactNode;
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
};

export function ContactButton({ subject, message, children, ...props }: ContactButtonProps) {
  const open = useContext(ContactContext);
  return <Button type="button" {...props} aria-haspopup="dialog" onClick={() => open?.({ subject, message })}>{children}</Button>;
}
