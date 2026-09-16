'use client';

import Link from 'next/link';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, type ReactNode } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function RecordSidePanelDialog({
  title,
  closeLabel,
  closeHref,
  children,
}: {
  title: string;
  closeLabel: string;
  closeHref: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const panelRef = useRef<HTMLElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    panel?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (!panel) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        router.push(closeHref, { scroll: false });
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)]
        .filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
      if (!focusable.length) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previous?.isConnected) previous.focus();
    };
  }, [closeHref, router]);

  return (
    <>
      <Link className="record-panel-backdrop" href={closeHref} scroll={false} tabIndex={-1} aria-hidden="true" />
      <aside
        ref={panelRef}
        className="record-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="record-panel-toolbar">
          <span id={titleId}>{title}</span>
          <Link className="panel-close" href={closeHref} scroll={false} aria-label={closeLabel}>
            <X aria-hidden="true" size={17} />
          </Link>
        </div>
        <div className="record-panel-scroll">{children}</div>
      </aside>
    </>
  );
}
