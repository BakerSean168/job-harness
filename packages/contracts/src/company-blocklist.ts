import { z } from 'zod';
import { EntityIdSchema, IsoDateTimeSchema } from './schemas';

export const CompanyBlockRuleSchema = z.object({
  id: EntityIdSchema,
  pattern: z.string().trim().min(2).max(160),
  matchMode: z.enum(['exact', 'prefix', 'contains']),
  category: z.enum(['former_employer', 'hr_agency', 'it_services', 'manual']),
  note: z.string().trim().max(500).nullable(),
  active: z.boolean(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
}).strict();

export const UpsertCompanyBlockRuleInputSchema = CompanyBlockRuleSchema.pick({
  pattern: true, matchMode: true, category: true, note: true, active: true,
}).extend({
  id: EntityIdSchema.optional(),
  note: z.string().trim().max(500).nullable().optional(),
  active: z.boolean().default(true),
}).strict();

export const ListCompanyBlockRulesOutputSchema = z.object({
  items: z.array(CompanyBlockRuleSchema),
}).strict();

export const DeleteCompanyBlockRuleOutputSchema = z.object({ deleted: z.boolean() }).strict();

export type CompanyBlockRule = z.infer<typeof CompanyBlockRuleSchema>;
export type UpsertCompanyBlockRuleInput = z.input<typeof UpsertCompanyBlockRuleInputSchema>;
export type ListCompanyBlockRulesOutput = z.infer<typeof ListCompanyBlockRulesOutputSchema>;
