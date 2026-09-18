'use client';

import { useActionState, useMemo, useState } from 'react';
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
import { sameManagedJob, type AtsBindingTarget } from '@/lib/ats-binding-targets';

export interface AtsCharacterizationCopy {
  readonly title: string;
  readonly description: string;
  readonly agent: string;
  readonly targetUrl: string;
  readonly pendingBindings: string;
  readonly pendingDescription: string;
  readonly pendingNone: string;
  readonly openTarget: string;
  readonly expectedResume: string;
  readonly targetHint: string;
  readonly mode: string;
  readonly isolatedMode: string;
  readonly stagedMode: string;
  readonly stagedHint: string;
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
  bindingTargets,
  copy,
}: {
  agents: readonly BrowserExtensionAgentView[];
  profiles: readonly ResumeProfile[];
  bindings: readonly SiteResumeBinding[];
  bindingTargets: readonly AtsBindingTarget[];
  copy: AtsCharacterizationCopy;
}) {
  const online = agents.filter((agent) => agent.online);
  const initialTarget = bindingTargets[0] ?? null;
  const [selectedTargetId, setSelectedTargetId] = useState(initialTarget?.intentId ?? '');
  const selectedTarget = useMemo(() => bindingTargets.find((target) => target.intentId === selectedTargetId) ?? null, [bindingTargets, selectedTargetId]);
  const [targetUrl, setTargetUrl] = useState(initialTarget?.targetUrl ?? '');
  const [mode, setMode] = useState<'site-readonly' | 'site-staged-readonly'>(initialTarget ? 'site-staged-readonly' : 'site-readonly');
  const [state, action, pending] = useActionState(characterizeAtsSiteAction, initialAtsCharacterizationActionState);
  const [bindingState, bindingAction, bindingPending] = useActionState(createSiteResumeBindingAction, initialSiteResumeBindingActionState);
  const family = state.evidence ? siteFamily(state.evidence.currentUrl) : null;
  const candidates = state.evidence ? resumeCandidates(state.evidence) : [];
  const evidenceTarget = state.evidence ? bindingTargets.find((target) => sameManagedJob(target.targetUrl, state.evidence!.currentUrl)) ?? selectedTarget : selectedTarget;
  const expectedProfileId = evidenceTarget?.profileId ?? profiles[0]?.id ?? '';
  return (
    <section className="settings-panel">
      <div className="management-panel-heading"><h2>{copy.title}</h2></div>
      <p className="settings-note">{copy.description}</p>
      <div className="settings-row">
        <div>
          <strong>{copy.pendingBindings}</strong>
          <p>{copy.pendingDescription}</p>
        </div>
      </div>
      {bindingTargets.length ? (
        <div className="settings-pairing-form">
          <label>{copy.pendingBindings}
            <select value={selectedTargetId} onChange={(event) => {
              const nextId = event.target.value;
              const next = bindingTargets.find((target) => target.intentId === nextId) ?? null;
              setSelectedTargetId(nextId);
              if (next) { setTargetUrl(next.targetUrl); setMode('site-staged-readonly'); }
            }}>
              {bindingTargets.map((target) => <option key={target.intentId} value={target.intentId}>{target.companyName} · {target.title} · {target.siteFamily}</option>)}
            </select>
          </label>
          {selectedTarget ? (
            <div className="settings-row settings-download-row">
              <div><strong>{selectedTarget.companyName} · {selectedTarget.title}</strong><p>{copy.expectedResume}: <code>{selectedTarget.profileId}</code></p></div>
              <a className="action-button" href={selectedTarget.targetUrl} target="_blank" rel="noreferrer">{copy.openTarget}</a>
            </div>
          ) : null}
        </div>
      ) : <p className="settings-note">{copy.pendingNone}</p>}
      <form action={action} className="settings-pairing-form">
        <label>{copy.agent}
          <select name="agentId" required defaultValue={online[0]?.agentId ?? ''} disabled={!online.length || pending}>
            {!online.length ? <option value="">—</option> : online.map((agent) => <option key={agent.agentId} value={agent.agentId}>{agent.name} · {agent.agentId}</option>)}
          </select>
        </label>
        <label>{copy.targetUrl}
          <input name="targetUrl" type="url" required value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} placeholder="https://www.zhaopin.com/jobdetail/...htm" disabled={!online.length || pending} />
        </label>
        <label>{copy.mode}
          <select name="mode" value={mode} onChange={(event) => setMode(event.target.value === 'site-staged-readonly' ? 'site-staged-readonly' : 'site-readonly')} disabled={!online.length || pending}>
            <option value="site-readonly">{copy.isolatedMode}</option>
            <option value="site-staged-readonly">{copy.stagedMode}</option>
          </select>
        </label>
        <p className="settings-note">{copy.targetHint}</p>
        <p className="settings-note">{copy.stagedHint}</p>
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
                <select key={`${state.runId ?? 'none'}:${expectedProfileId}`} name="profileId" required defaultValue={expectedProfileId} disabled={bindingPending}>
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
