'use client';

import { useActionState } from 'react';
import { characterizeAtsSiteAction } from '@/app/settings/actions';
import { initialAtsCharacterizationActionState } from '@/app/settings/characterization-state';
import type { BrowserExtensionAgentView } from '@/lib/job-harness-client';

export interface AtsCharacterizationCopy {
  readonly title: string;
  readonly description: string;
  readonly agent: string;
  readonly targetUrl: string;
  readonly targetHint: string;
  readonly run: string;
  readonly running: string;
  readonly error: string;
  readonly result: string;
  readonly signals: string;
  readonly actions: string;
  readonly controls: string;
  readonly formHash: string;
  readonly noSignals: string;
  readonly noActions: string;
  readonly noControls: string;
}

export function AtsCharacterizationPanel({ agents, copy }: { agents: readonly BrowserExtensionAgentView[]; copy: AtsCharacterizationCopy }) {
  const online = agents.filter((agent) => agent.online);
  const [state, action, pending] = useActionState(characterizeAtsSiteAction, initialAtsCharacterizationActionState);
  return (
    <section className="settings-panel">
      <div className="management-panel-heading"><h2>{copy.title}</h2></div>
      <p className="settings-note">{copy.description}</p>
      <form action={action} className="settings-pairing-form">
        <label>{copy.agent}
          <select name="agentId" required defaultValue={online[0]?.agentId ?? ''} disabled={!online.length || pending}>
            {!online.length ? <option value="">—</option> : online.map((agent) => <option key={agent.agentId} value={agent.agentId}>{agent.name} · {agent.agentId}</option>)}
          </select>
        </label>
        <label>{copy.targetUrl}
          <input name="targetUrl" type="url" required placeholder="https://www.zhaopin.com/jobdetail/...htm" disabled={!online.length || pending} />
        </label>
        <p className="settings-note">{copy.targetHint}</p>
        <button className="action-button" type="submit" disabled={!online.length || pending}>{pending ? copy.running : copy.run}</button>
      </form>
      {!state.ok && state.error ? <p className="form-error" role="alert">{copy.error}: {state.error}</p> : null}
      {state.ok && state.evidence ? (
        <div className="settings-pairing-result" role="status">
          <h3>{copy.result}</h3>
          <p><strong>{state.evidence.title}</strong></p>
          <p><code>{state.evidence.currentUrl}</code></p>
          <p>{copy.signals}: {state.evidence.stateSignals.length ? state.evidence.stateSignals.join(' · ') : copy.noSignals}</p>
          <p>{copy.formHash}: <code>{state.evidence.formStateHash}</code></p>
          <p>{copy.actions}: {state.evidence.actions.length ? state.evidence.actions.map((item) => `${item.text || item.tag}${item.disabled || item.ariaDisabled ? ' [disabled]' : ''}`).join(' · ') : copy.noActions}</p>
          <p>{copy.controls}: {state.evidence.controls.length ? state.evidence.controls.map((item) => `${item.kind}:${item.label || item.name || '—'}${item.required ? '*' : ''}`).join(' · ') : copy.noControls}</p>
          {state.runId ? <p>Run: <code>{state.runId}</code></p> : null}
        </div>
      ) : null}
    </section>
  );
}
