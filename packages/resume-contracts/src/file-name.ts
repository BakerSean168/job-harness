/**
 * Public-facing resume attachment name. Stable Profile IDs and immutable
 * Revision numbers are internal provenance, never recipient-facing suffixes.
 * A frozen pre-cleanup revision can still be attached without leaking v5.1.
 */
export function resumeFileBaseName(candidate: string | null | undefined, fallback = 'resume'): string {
  const raw = (candidate?.trim() || fallback).normalize('NFKC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.pdf$/i, '')
    .replace(/[\s._-]+v5\.1$/i, '')
    .replace(/[. ]+$/g, '')
    .trim();
  return (raw.slice(0, 120).replace(/[. ]+$/g, '').trim() || 'resume');
}

export function resumeAttachmentFileName(candidate: string | null | undefined, fallback = 'resume'): string {
  return `${resumeFileBaseName(candidate, fallback)}.pdf`;
}
