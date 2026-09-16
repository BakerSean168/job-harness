'use client';

import { AlertCircle } from 'lucide-react';

export function InlineError({
  message,
  retryLabel,
  onRetry,
}: {
  message: string;
  retryLabel: string;
  onRetry?: () => void;
}) {
  return (
    <div className="inline-error" role="alert">
      <AlertCircle aria-hidden="true" size={18} />
      <span>{message}</span>
      {onRetry ? <button type="button" onClick={onRetry}>{retryLabel}</button> : null}
    </div>
  );
}
