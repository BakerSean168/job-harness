'use server';

import { revalidatePath } from 'next/cache';
import { UpsertCompanyBlockRuleInputSchema } from '@job-harness/contracts';
import { getJobHarnessClient } from '@/lib/job-harness-client';

function value(form: FormData, key: string): string {
  const text = form.get(key);
  return typeof text === 'string' ? text.trim() : '';
}

export async function addCompanyBlockRuleAction(form: FormData): Promise<void> {
  const input = UpsertCompanyBlockRuleInputSchema.parse({
    pattern: value(form, 'pattern'),
    matchMode: value(form, 'matchMode') || 'exact',
    category: value(form, 'category') || 'manual',
    note: value(form, 'note') || null,
    active: true,
  });
  await getJobHarnessClient().companyBlocklist.upsert(input);
  revalidatePath('/companies');
  revalidatePath('/jobs');
  revalidatePath('/inbox');
}

export async function toggleCompanyBlockRuleAction(form: FormData): Promise<void> {
  const id = value(form, 'ruleId');
  const rules = await getJobHarnessClient().companyBlocklist.list();
  const rule = rules.items.find((candidate) => candidate.id === id);
  if (!rule) throw new Error('The employer exclusion rule no longer exists');
  await getJobHarnessClient().companyBlocklist.upsert({
    id: rule.id, pattern: rule.pattern, matchMode: rule.matchMode,
    category: rule.category, note: rule.note, active: !rule.active,
  });
  revalidatePath('/companies');
  revalidatePath('/jobs');
  revalidatePath('/inbox');
}

export async function deleteCompanyBlockRuleAction(form: FormData): Promise<void> {
  const id = value(form, 'ruleId');
  if (!id) throw new Error('Missing company block rule');
  await getJobHarnessClient().companyBlocklist.delete(id);
  revalidatePath('/companies');
  revalidatePath('/jobs');
  revalidatePath('/inbox');
}
