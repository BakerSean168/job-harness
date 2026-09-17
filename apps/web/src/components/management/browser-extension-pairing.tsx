'use client';

import { useActionState } from 'react';
import type { BrowserExtensionAgentView } from '@/lib/job-harness-client';
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
  readonly agentsTitle: string;
  readonly noAgents: string;
  readonly online: string;
  readonly offline: string;
  readonly lastSeen: string;
  readonly capabilities: string;
  readonly resumeUpload: string;
  readonly screenshots: string;
}


export function BrowserExtensionPairing({ publicBridgeUrl, agents, copy }: { publicBridgeUrl: string | null; agents: readonly BrowserExtensionAgentView[]; copy: BrowserExtensionPairingCopy }) {
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
      <div className="settings-extension-agents">
        <strong>{copy.agentsTitle}</strong>
        {agents.length ? agents.map((agent) => (
          <div className="settings-extension-agent" key={agent.agentId}>
            <div><span className="settings-state" data-enabled={agent.online ? 'true' : undefined}>{agent.online ? copy.online : copy.offline}</span><strong>{agent.name}</strong><code>{agent.agentId}</code></div>
            <p>{[agent.browserName, agent.platform, `v${agent.version}`].filter(Boolean).join(' · ')}</p>
            <p>{copy.lastSeen}: <time dateTime={agent.lastSeenAt}>{new Date(agent.lastSeenAt).toLocaleString()}</time></p>
            <p>{copy.capabilities}: {agent.resumeUpload ? copy.resumeUpload : '—'}{agent.screenshots ? ` · ${copy.screenshots}` : ''}</p>
          </div>
        )) : <p className="settings-note">{copy.noAgents}</p>}
      </div>
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
