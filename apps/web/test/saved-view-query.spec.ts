import { describe, expect, it } from 'vitest';
import {
  applicationSavedViewDefinitionFromParams,
  applicationsHrefFromSavedViewDefinition,
  jobSavedViewDefinitionFromParams,
  jobsHrefFromSavedViewDefinition,
} from '../src/components/saved-views/query';

describe('Saved View query projection', () => {
  it('keeps durable Jobs filter semantics and drops transient URL state', () => {
    const definition = jobSavedViewDefinitionFromParams({
      company: 'Acme', title: 'Agent', city: 'Hangzhou', state: 'shortlisted', source: 'official', applied: 'no', campaign: 'campaign-1',
      offset: '50', job: 'job-side-panel', junk: 'ignored',
    });
    expect(definition).toEqual({
      company: 'Acme', title: 'Agent', city: 'Hangzhou', state: 'shortlisted', source: 'official', applied: false, campaignId: 'campaign-1',
    });
    expect(jobsHrefFromSavedViewDefinition(definition)).toBe('/jobs?company=Acme&title=Agent&city=Hangzhou&state=shortlisted&source=official&applied=no&campaign=campaign-1');
  });

  it('keeps durable Application filters/view mode and drops paging/detail state', () => {
    const definition = applicationSavedViewDefinitionFromParams({
      company: 'Acme', stage: 'screening', campaign: 'campaign-1', resume: 'resume-1', from: '2026-09-01', to: '2026-09-30', terminal: 'include', view: 'table',
      offset: '100', application: 'application-panel',
    });
    expect(definition).toEqual({
      company: 'Acme', stage: 'screening', campaignId: 'campaign-1', resumeProfileId: 'resume-1', appliedFrom: '2026-09-01', appliedTo: '2026-09-30', terminal: 'include', view: 'table',
    });
    expect(applicationsHrefFromSavedViewDefinition(definition)).toBe('/applications?company=Acme&stage=screening&campaign=campaign-1&resume=resume-1&from=2026-09-01&to=2026-09-30&terminal=include&view=table');
  });
});
