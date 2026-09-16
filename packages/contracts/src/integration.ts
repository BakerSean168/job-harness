import { z } from 'zod';
import { PipelineStatsOutputSchema } from './operations';
import { EntityIdSchema, IsoDateTimeSchema } from './schemas';

/**
 * Host-owned lifecycle for a Goal -> Career Campaign binding.
 *
 * This value is an integration contract only. Job Harness MUST NOT persist it
 * as Career domain truth and host implementations MUST NOT model it as a
 * cross-database foreign key.
 */
export const CareerIntegrationBindingStatusSchema = z.enum(['active', 'paused', 'detached']);

/**
 * V1 host binding intentionally supports only MemoFlow-style Goal -> Campaign
 * association. A second real external resource type is required before this is
 * generalized into a universal extension-binding model.
 */
export const CareerIntegrationBindingSchema = z
  .object({
    identityId: EntityIdSchema,
    hostKind: z.literal('goal'),
    hostId: EntityIdSchema,
    extensionId: z.literal('career'),
    resourceKind: z.literal('campaign'),
    resourceId: EntityIdSchema,
    status: CareerIntegrationBindingStatusSchema,
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict();

/** Stable Campaign-scoped progress projection exposed through CareerGateway. */
export const CareerCampaignProgressSchema = PipelineStatsOutputSchema;

export type CareerIntegrationBindingStatus = z.infer<typeof CareerIntegrationBindingStatusSchema>;
export type CareerIntegrationBinding = z.infer<typeof CareerIntegrationBindingSchema>;
export type CareerCampaignProgress = z.infer<typeof CareerCampaignProgressSchema>;
