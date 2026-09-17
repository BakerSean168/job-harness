'use client';

import { useActionState } from 'react';
import {
  createBrowserExtensionPairingAction,
  initialBrowserExtensionPairingState,
} from '@/app/settings/actions';

export interface BrowserExtensionPairingCopy {
  readonly title: string;
  readonly description: string;
  readonly bridgeUrl: string;
  readonly unavailable: string;
  readonly generate: string;
  readonly generating: string;
  readonly code: string;
  readonly expires: string;
  readonly instructions: string;
  readonly error: string;
}

export function BrowserExtensionPairing({ publicBridgeUrl, copy }: { publicBridgeUrl: string | null; copy: BrowserExtensionPairingCopy }) {
  const [state, action, pending] = useActionState(createBrowserExtensionPairingAction, initialBrowserExtensionPairingState);
  return (
    <section className="settings-panel browser-extension-pairing">
      <div className="management-panel-heading"><h2>{copy.title}</h2></div>
      <p className="settings-note">{copy.description}</p>
      <div className="settings-row">
        <div><strong>{copy.bridgeUrl}</strong><p><code>{publicBridgeUrl ?? copy.unavailable}</code></p></div>
      </div>
      <form action={action} className="settings-pairing-form">
        <button className="action-button" type="submit" disabled={pending}>{pending ? copy.generating : copy.generate}</button>
      </form>
      {state.ok && state.code && state.expiresAt ? (
        <div className="settings-pairing-result" role="status">
          <div><span>{copy.code}</span><code>{state.code}</code></div>
          <div><span>{copy.expires}</span><time dateTime={state.expiresAt}>{new Date(state.expiresAt).toLocaleString()}</time></div>
          <p>{copy.instructions}</p>
        </div>
      ) : null}
      {!state.ok && state.error ? <p className="form-error" role="alert">{copy.error}: {state.error}</p> : null}
    </section>
  );
}
