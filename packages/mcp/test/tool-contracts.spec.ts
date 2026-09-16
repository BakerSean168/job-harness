import { describe, expect, it } from 'vitest';
import { CAREER_MCP_TOOLS } from '../src';

const expectedNames = [
  'career_context_get',
  'career_jobs_search',
  'career_job_get',
  'career_job_duplicate_check',
  'career_applications_list',
  'career_application_get',
  'career_campaigns_list',
  'career_campaign_get',
  'career_resumes_list',
  'career_pipeline_stats',
  'career_jobs_upsert_batch',
  'career_job_state_set',
  'career_application_record',
  'career_application_transition',
  'career_discovery_begin',
  'career_discovery_complete',
  'career_campaign_upsert',
];

describe('MCP contract surface', () => {
  it('freezes the Phase-0 minimal tool names', () => {
    expect(CAREER_MCP_TOOLS.map((tool) => tool.name)).toEqual(expectedNames);
  });

  it('has no duplicate tool names', () => {
    const names = CAREER_MCP_TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('does not expose a privileged external application submission tool', () => {
    expect(CAREER_MCP_TOOLS.some((tool) => tool.name.includes('submit_application'))).toBe(false);
    expect(CAREER_MCP_TOOLS.every((tool) => tool.externalSideEffect === false)).toBe(true);
  });
});

it('uses the durable DiscoveryRun schema as career_discovery_begin output', () => {
  const begin = CAREER_MCP_TOOLS.find((tool) => tool.name === 'career_discovery_begin');
  expect(begin).toBeDefined();
  const parsed = begin!.outputSchema.safeParse({
    id: 'run-1',
    campaignId: null,
    executor: 'chatgpt-web',
    contextSnapshot: {},
    startedAt: '2026-09-16T08:00:00.000Z',
    completedAt: null,
    candidateCount: 0,
    insertedCount: 0,
    duplicateCount: 0,
    rejectedCount: 0,
  });
  expect(parsed.success).toBe(true);
});
