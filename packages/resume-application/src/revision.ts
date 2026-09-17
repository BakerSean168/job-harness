import { createHash } from 'node:crypto';
import type { ResolvedResume } from '@job-harness/resume-contracts';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function canonicalResumeJson(value: ResolvedResume): string {
  return JSON.stringify(canonicalize(value));
}

export function hashResolvedResume(value: ResolvedResume): string {
  return createHash('sha256').update(canonicalResumeJson(value)).digest('hex');
}

export interface ResumeSnapshotChange {
  readonly path: string;
  readonly kind: 'added' | 'removed' | 'changed';
  readonly before: unknown | null;
  readonly after: unknown | null;
}

function pointerSegment(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1');
}

function samePrimitive(left: unknown, right: unknown): boolean {
  return Object.is(left, right);
}

export function diffResumeSnapshots(before: unknown, after: unknown): readonly ResumeSnapshotChange[] {
  const changes: ResumeSnapshotChange[] = [];

  const walk = (left: unknown, right: unknown, path: string) => {
    if (samePrimitive(left, right)) return;
    const leftArray = Array.isArray(left);
    const rightArray = Array.isArray(right);
    if (leftArray || rightArray) {
      if (!(leftArray && rightArray)) {
        changes.push({ path: path || '/', kind: 'changed', before: left ?? null, after: right ?? null });
        return;
      }
      const max = Math.max(left.length, right.length);
      for (let index = 0; index < max; index += 1) {
        const next = `${path}/${index}`;
        if (index >= left.length) changes.push({ path: next, kind: 'added', before: null, after: right[index] ?? null });
        else if (index >= right.length) changes.push({ path: next, kind: 'removed', before: left[index] ?? null, after: null });
        else walk(left[index], right[index], next);
      }
      return;
    }

    const leftObject = left != null && typeof left === 'object';
    const rightObject = right != null && typeof right === 'object';
    if (leftObject || rightObject) {
      if (!(leftObject && rightObject)) {
        changes.push({ path: path || '/', kind: 'changed', before: left ?? null, after: right ?? null });
        return;
      }
      const leftRecord = left as Record<string, unknown>;
      const rightRecord = right as Record<string, unknown>;
      const keys = [...new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])].sort();
      for (const key of keys) {
        const next = `${path}/${pointerSegment(key)}`;
        if (!(key in leftRecord)) changes.push({ path: next, kind: 'added', before: null, after: rightRecord[key] ?? null });
        else if (!(key in rightRecord)) changes.push({ path: next, kind: 'removed', before: leftRecord[key] ?? null, after: null });
        else walk(leftRecord[key], rightRecord[key], next);
      }
      return;
    }

    changes.push({ path: path || '/', kind: 'changed', before: left ?? null, after: right ?? null });
  };

  walk(before, after, '');
  return changes;
}
