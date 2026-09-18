'use client';

import { useActionState } from 'react';
import type { SiteResumeBinding } from '@job-harness/contracts';
import type { ResumeProfile } from '@job-harness/resume-contracts';
import {
  characterizeAtsSiteAction,
  createSiteResumeBindingAction,
  revokeSiteResumeBindingAction,
} from '@/app/settings/actions';
import {
  initialAtsCharacterizationActionState,
  initialSiteResumeBindingActionState,
} from '@/app/settings/characterization-state';
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
  readonly bindingTitle: string;
  readonly bindingDescription: string;
  readonly siteResumeLabel: string;
  readonly profile: string;
  readonly confirmBinding: string;
  readonly bindingPending: string;
  readonly bindingSuccess: string;
  readonly bindingError: string;
  readonly noBindingCandidates: string;
  readonly existingBindings: string;
  readonly noBindings: string;
  readonly revoke: string;
}

function localized(value: { readonly 'zh-CN'?: string | undefined; readonly en?: string | undefined }): string {
  return value['zh-CN'] ?? value.en ?? '';
}
function siteFamily(url: string): 'zhilian' | 'liepin' | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === 'zhaopin.com' || host === 'www.zhaopin.com') return 'zhilian';
    if (host === 'liepin.com' || host === 'www.liepin.com') return 'liepin';
  } catch {}
  return null;
}
function resumeCandidates(evidence: NonNullable<typeof initialAtsCharacterizationActionState.evidence>): string[] {
  const result = new Set<string>();
  for (const control of evidence.controls) {
    const semantics = [control.label, control.name, control.description, control.sectionLabel, ...control.semanticHints].filter(Boolean).join(' ');
    if (!/简历|resume/i.test(semantics)) continue;
    for (const label of control.optionLabels) {
      const value = label.replace(/\s+/g, ' ').trim();
      if (!value || /^(请选择|选择简历|请选择简历|select|choose)$/i.test(value)) continue;
      result.add(value);
    }
  }
  return [...result];
}

export function AtsCharacterizationPanel({
  agents,
  profiles,
  bindings,
  copy,
}: {
  agents: readonly BrowserExtensionAgentView[];
  profiles: readonly ResumeProfile[];
  bindings: readonly SiteResumeBinding[];
  copy: AtsCharacterizationCopy;
}) {
  const online = agents.filter((agent) => agent.online);
  const [state, action, pending] = useActionState(characterizeAtsSiteAction, initialAtsCharacterizationActionState);
  const [bindingState, bindingAction, bindingPending] = useActionState(createSiteResumeBindingAction, initialSiteResumeBindingActionState);
  const family = state.evidence ? siteFamily(state.evidence.currentUrl) : null;
  const candidates = state.evidence ? resumeCandidates(state.evidence) : [];
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

          <div className="settings-row">
            <div>
              <strong>{copy.bindingTitle}</strong>
              <p>{copy.bindingDescription}</p>
            </div>
          </div>
          {family && state.runId && state.agentId && candidates.length ? (
            <form action={bindingAction} className="settings-pairing-form">
              <input type="hidden" name="siteFamily" value={family} />
              <input type="hidden" name="browserAgentId" value={state.agentId} />
              <input type="hidden" name="characterizationRunId" value={state.runId} />
              <label>{copy.siteResumeLabel}
                <select name="externalResumeLabel" required disabled={bindingPending}>
                  {candidates.map((label) => <option key={label} value={label}>{label}</option>)}
                </select>
              </label>
              <label>{copy.profile}
                <select name="profileId" required disabled={bindingPending}>
                  {profiles.map((profile) => <option key={profile.id} value={profile.id}>{localized(profile.name)} · {profile.id}</option>)}
                </select>
              </label>
              <button className="action-button" type="submit" disabled={bindingPending}>{bindingPending ? copy.bindingPending : copy.confirmBinding}</button>
            </form>
          ) : <p className="settings-note">{copy.noBindingCandidates}</p>}
          {bindingState.ok ? <p className="settings-note">{copy.bindingSuccess}: {bindingState.message}</p> : null}
          {!bindingState.ok && bindingState.message ? <p className="form-error">{copy.bindingError}: {bindingState.message}</p> : null}
        </div>
      ) : null}

      <div className="settings-extension-agents">
        <strong>{copy.existingBindings}</strong>
        {bindings.length ? bindings.map((binding) => (
          <div className="settings-extension-agent" key={binding.id}>
            <div><strong>{binding.externalResumeLabel}</strong><code>{binding.siteFamily} · {binding.profileId}</code></div>
            <p>{binding.browserAgentId} · {binding.assurance}</p>
            <p><code>{binding.resumeArtifactId}</code></p>
            <form action={revokeSiteResumeBindingAction}>
              <input type="hidden" name="bindingId" value={binding.id} />
              <button className="action-button" type="submit">{copy.revoke}</button>
            </form>
          </div>
        )) : <p className="settings-note">{copy.noBindings}</p>}
      </div>
    </section>
  );
}
