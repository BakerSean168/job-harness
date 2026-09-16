import { describe, expect, it } from 'vitest';
import {
  ApplicationSchema,
  CareerIntegrationBindingSchema,
  JobSchema,
  UpsertJobsBatchInputSchema,
} from '../src';

const now = '2026-09-16T08:00:00.000Z';

describe('canonical contracts', () => {
  it('rejects Application stages masquerading as Job states', () => {
    const parsed = JobSchema.safeParse({
      id: 'job-1',
      companyId: 'company-1',
      companyName: 'Acme',
      title: 'AI Agent Engineer',
      city: 'Hangzhou',
      state: 'screening',
      description: null,
      listings: [],
      firstSeenAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects Job states masquerading as Application stages', () => {
    const parsed = ApplicationSchema.safeParse({
      id: 'app-1',
      jobId: 'job-1',
      currentStage: 'shortlisted',
      appliedAt: now,
      resumeProfileId: null,
      createdAt: now,
      updatedAt: now,
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts a listing-aware batch discovered by an external AI without coupling to a search provider', () => {
    const parsed = UpsertJobsBatchInputSchema.safeParse({
      jobs: [
        {
          companyName: 'Acme',
          title: 'AI Agent Engineer',
          city: 'Hangzhou',
          listings: [{
            sourceKind: 'official',
            url: 'https://example.com/jobs/1',
            identityKind: 'url',
            status: 'active',
          }],
          observedAt: now,
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });
  it('freezes Goal -> Campaign binding as host-owned integration truth', () => {
    const binding = CareerIntegrationBindingSchema.parse({
      identityId: 'identity-1',
      hostKind: 'goal',
      hostId: 'goal-1',
      extensionId: 'career',
      resourceKind: 'campaign',
      resourceId: 'campaign-1',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    expect(binding.resourceId).toBe('campaign-1');
    expect(CareerIntegrationBindingSchema.safeParse({ ...binding, hostKind: 'task' }).success).toBe(false);
    expect(CareerIntegrationBindingSchema.safeParse({ ...binding, resourceKind: 'job' }).success).toBe(false);
  });

});

import { generateJobHarnessOpenApiDocument, JOB_HARNESS_REST_V1_ROUTES } from '../src';

describe('REST v1 OpenAPI projection', () => {
  it('projects every registered REST contract exactly once with unique operationIds', () => {
    const document = generateJobHarnessOpenApiDocument() as {
      openapi: string;
      paths: Record<string, Record<string, { operationId?: string; security?: unknown }>>;
    };
    expect(document.openapi).toBe('3.1.0');
    const operations = Object.values(document.paths).flatMap((path) => Object.values(path));
    expect(operations).toHaveLength(Object.keys(JOB_HARNESS_REST_V1_ROUTES).length);
    const operationIds = operations.map((operation) => operation.operationId);
    expect(new Set(operationIds).size).toBe(operationIds.length);
    expect(operationIds).toContain('getPipelineStats');
    expect(operationIds).toContain('beginDiscovery');
    expect(operationIds).toContain('completeDiscovery');
    expect(operations.every((operation) => Array.isArray(operation.security))).toBe(true);
  });

  it('uses canonical route paths for the integration-critical surface', () => {
    const routes = JOB_HARNESS_REST_V1_ROUTES;
    expect(routes.pipeline).toMatchObject({ method: 'get', path: '/pipeline' });
    expect(routes.beginDiscovery).toMatchObject({ method: 'post', path: '/discovery' });
    expect(routes.completeDiscovery).toMatchObject({ method: 'post', path: '/discovery/:runId/complete' });
    expect(routes.backup).toMatchObject({ method: 'get', path: '/backup', binaryResponse: true });
  });
});
