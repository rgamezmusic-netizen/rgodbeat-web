'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import styles from './Ranking.module.css';

export function SidePanel({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const panel = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    close.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); }
      if (event.key !== 'Tab') return;
      const targets = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], textarea:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? [])]
        .filter(element => element.getClientRects().length > 0);
      const first = targets[0]; const last = targets.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keyboard);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', keyboard);
      previous?.focus();
    };
  }, []);
  if (typeof document === 'undefined') return null;
  return createPortal(<div className={styles.panelOverlay}>
    <button className={styles.panelBackdrop} aria-label="Cerrar panel" tabIndex={-1} onClick={onClose} />
    <section ref={panel} className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="ranking-panel-title">
      <header className={styles.panelHeader}><h2 id="ranking-panel-title">{title}</h2><button ref={close} className={styles.iconButton} onClick={onClose} aria-label="Cerrar panel"><X size={22} /></button></header>
      <div className={styles.panelBody}>{children}</div>
    </section>
  </div>, document.body);
}
