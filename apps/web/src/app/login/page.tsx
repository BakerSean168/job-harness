import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LockKeyhole } from 'lucide-react';
import { getWebAuthRuntimeConfig, sanitizeReturnPath } from '@/auth/session';
import { getMessages } from '@/i18n/server';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const config = getWebAuthRuntimeConfig();
  if (!config.enabled) redirect('/');
  const params = await searchParams;
  const rawError = Array.isArray(params.error) ? params.error[0] : params.error;
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const next = sanitizeReturnPath(rawNext);
  const messages = await getMessages();
  const copy = messages.authWorkspace;
  const error = rawError === 'config' || !config.configured
    ? copy.configError
    : rawError === 'invalid'
      ? copy.invalid
      : null;

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">
          <span className="auth-brand-mark"><LockKeyhole aria-hidden="true" size={18} /></span>
          <div><strong>{messages.brand.name}</strong><span>{messages.brand.subtitle}</span></div>
        </div>
        <div className="auth-copy">
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
        {error ? <div className="auth-error" role="alert">{error}</div> : null}
        {config.configured ? (
          <form className="auth-form" method="post" action="/auth/login">
            <input type="hidden" name="next" value={next} />
            <label><span>{copy.password}</span><input name="password" type="password" autoComplete="current-password" required autoFocus /></label>
            <button type="submit">{copy.signIn}</button>
          </form>
        ) : null}
        <p className="auth-session-note">{copy.sessionNote}</p>
        {config.configured && next !== '/' ? <Link className="auth-back-link" href="/login">{copy.back}</Link> : null}
      </section>
    </main>
  );
}
