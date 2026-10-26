"use client";

import { useEffect, useRef, type RefObject } from 'react';

export function useModalFocus(open: boolean, ref: RefObject<HTMLElement | null>, onClose: () => void, returnFocusRef?: RefObject<HTMLElement | null>) {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const returnTarget = returnFocusRef?.current || previous;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]')).filter(element => element.getClientRects().length);
    (focusable()[0] || dialog).focus();
    const keydown = (event: KeyboardEvent) => {
      // Keep Studio shortcuts from editing the project behind this dialog.
      if (event.target instanceof Node && dialog.contains(event.target)) event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      const first = elements[0], last = elements.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      if (returnTarget?.isConnected) returnTarget.focus();
    };
  }, [open, ref, returnFocusRef]);
}
