import type { Page } from 'playwright';
import type { BrowserActionSnapshot, BrowserClickExpectation, BrowserControlSnapshot, BrowserDriverPort, BrowserUploadFile } from './types';

export class PlaywrightBrowserDriver implements BrowserDriverPort {
  constructor(private readonly page: Page) {}

  private async ensureEvaluationHelpers(): Promise<void> {
    // apps/apply-worker runs TypeScript through tsx/esbuild. With keepNames, nested
    // functions serialized into page.evaluate may reference esbuild's __name helper.
    // The compiled production JS does not need this, but defining the identity helper
    // in page scope keeps source-runtime and compiled-runtime behavior identical.
    await this.page.evaluate('globalThis.__name = globalThis.__name || ((value) => value)');
  }

  async navigate(url: string): Promise<void> {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`Unsupported navigation protocol: ${parsed.protocol}`);
    await this.page.goto(parsed.toString(), { waitUntil: 'domcontentloaded', timeout: 45_000 });
  }

  currentUrl(): string { return this.page.url(); }
  async refreshCurrentUrl(): Promise<string> { return this.page.url(); }
  title(): Promise<string> { return this.page.title(); }

  async bodyText(limit = 50_000): Promise<string> {
    const text = await this.page.locator('body').innerText({ timeout: 10_000 }).catch(() => '');
    return text.slice(0, Math.max(0, limit));
  }

  async exists(selector: string): Promise<boolean> {
    return (await this.page.locator(selector).count()) > 0;
  }

  async text(selector: string): Promise<string | null> {
    const locator = this.page.locator(selector).first();
    if (await locator.count() === 0) return null;
    return locator.innerText({ timeout: 5_000 }).catch(() => null);
  }

  async fill(selector: string, value: string): Promise<void> {
    await this.page.locator(selector).first().fill(value);
  }

  async select(selector: string, value: string | readonly string[]): Promise<void> {
    const locator = this.page.locator(selector);
    const first = locator.first();
    const tag = await first.evaluate((element) => element.tagName.toLowerCase());
    const values = Array.isArray(value) ? [...value] : [value];
    if (tag === 'select') {
      await first.selectOption(values);
      return;
    }
    const target = locator.filter({ has: this.page.locator(`input[value=${JSON.stringify(values[0] ?? '')}]`) });
    if (await target.count()) {
      await target.locator('input').first().setChecked(true);
      return;
    }
    const controls = locator;
    for (let index = 0; index < await controls.count(); index += 1) {
      const candidate = controls.nth(index);
      if (await candidate.getAttribute('value') === values[0]) {
        await candidate.setChecked(true);
        return;
      }
    }
    throw new Error(`No radio/select option matched '${values[0] ?? ''}'`);
  }

  async setChecked(selector: string, checked: boolean): Promise<void> {
    const locator = this.page.locator(selector).first();
    await locator.setChecked(checked);
  }

  async click(selector: string, expectation: BrowserClickExpectation = {}): Promise<void> {
    const locator = this.page.locator(selector).first();
    if (expectation.expectedText) {
      const actual = (await locator.innerText()).replace(/\s+/g, ' ').trim();
      if (actual !== expectation.expectedText.replace(/\s+/g, ' ').trim()) {
        throw new Error(`Click target text changed: expected '${expectation.expectedText}', got '${actual}'`);
      }
    }
    await locator.click();
  }

  async upload(selector: string, file: BrowserUploadFile): Promise<void> {
    await this.page.locator(selector).first().setInputFiles({
      name: file.name,
      mimeType: file.mimeType,
      buffer: Buffer.from(file.bytes),
    });
  }

  wait(milliseconds: number): Promise<void> { return this.page.waitForTimeout(milliseconds); }

  async screenshot(): Promise<Uint8Array> {
    return new Uint8Array(await this.page.screenshot({ type: 'png', fullPage: false }));
  }

  async formStateHash(): Promise<string> {
    await this.ensureEvaluationHelpers();
    return this.page.evaluate(async () => {
      const compact = (value: unknown) => String(value ?? '').replace(/\r\n/g, '\n');
      const controls = [...document.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), textarea, select',
      )].filter((node): node is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
        node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement);
      const rows = controls.map((element, index) => {
        const ref = element.getAttribute('data-job-harness-field-id')
          || element.getAttribute('data-job-harness-radio-group')
          || element.name
          || element.id
          || `control-${index}`;
        let value: unknown;
        if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) {
          value = { checked: element.checked, value: compact(element.value) };
        } else if (element instanceof HTMLSelectElement && element.multiple) {
          value = [...element.selectedOptions].map((option) => compact(option.value)).sort();
        } else {
          value = compact(element.value);
        }
        return [ref, element.tagName.toLowerCase(), element instanceof HTMLInputElement ? element.type : '', value] as const;
      }).sort((left, right) => JSON.stringify(left.slice(0, 3)).localeCompare(JSON.stringify(right.slice(0, 3))));
      const bytes = new TextEncoder().encode(JSON.stringify({ url: location.href, rows }));
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
    });
  }

  async scanActions(): Promise<readonly BrowserActionSnapshot[]> {
    await this.ensureEvaluationHelpers();
    return this.page.evaluate(() => {
      type Action = {
        actionRef: string;
        tag: 'a' | 'button' | 'other';
        text: string;
        href: string | null;
        type: string | null;
        role: string | null;
        disabled: boolean;
        ariaDisabled: boolean;
      };
      const compact = (value: string | null | undefined, max = 500) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
      const visible = (element: Element) => {
        const style = window.getComputedStyle(element);
        const rect = (element as HTMLElement).getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const nodes = [...document.querySelectorAll('a[href], button, [role="button"]')]
        .filter((element): element is HTMLElement => element instanceof HTMLElement)
        .filter(visible)
        .slice(0, 500);
      const existingActionIds = nodes.map((element) => element.getAttribute('data-job-harness-action-id')).filter((value): value is string => Boolean(value));
      const actionIdCounts = new Map<string, number>();
      for (const value of existingActionIds) actionIdCounts.set(value, (actionIdCounts.get(value) ?? 0) + 1);
      const reservedActionIds = new Set(existingActionIds);
      const usedActionIds = new Set<string>();
      const allocateActionId = (element: HTMLElement) => {
        const candidate = element.getAttribute('data-job-harness-action-id');
        if (candidate && actionIdCounts.get(candidate) === 1 && !usedActionIds.has(candidate)) {
          usedActionIds.add(candidate);
          return candidate;
        }
        let index = 0;
        let id = `jha-${index}`;
        while (reservedActionIds.has(id) || usedActionIds.has(id)) id = `jha-${++index}`;
        element.setAttribute('data-job-harness-action-id', id);
        reservedActionIds.add(id);
        usedActionIds.add(id);
        return id;
      };
      return nodes.map((element): Action => {
        const id = allocateActionId(element);
        const tagName = element.tagName.toLowerCase();
        const anchor = element instanceof HTMLAnchorElement ? element : null;
        const button = element instanceof HTMLButtonElement ? element : null;
        return {
          actionRef: `[data-job-harness-action-id="${CSS.escape(id)}"]`,
          tag: tagName === 'a' ? 'a' : tagName === 'button' ? 'button' : 'other',
          text: compact(element.innerText || element.getAttribute('aria-label') || element.getAttribute('title')),
          href: anchor?.href ? compact(anchor.href, 2000) : null,
          type: button ? compact(button.type, 100) || null : null,
          role: compact(element.getAttribute('role'), 100) || null,
          disabled: button ? button.disabled : false,
          ariaDisabled: element.getAttribute('aria-disabled') === 'true',
        };
      });
    });
  }

  async scanControls(): Promise<readonly BrowserControlSnapshot[]> {
    await this.ensureEvaluationHelpers();
    return this.page.evaluate(() => {
      type Snapshot = {
        controlRef: string;
        kind: 'text' | 'textarea' | 'email' | 'tel' | 'url' | 'number' | 'date' | 'select' | 'radio' | 'checkbox' | 'file' | 'unknown';
        label: string;
        name: string | null;
        description: string | null;
        required: boolean;
        disabled: boolean;
        readOnly: boolean;
        options: Array<{ value: string; label: string; disabled: boolean }>;
        semanticHints: string[];
        accept: string | null;
        multiple: boolean;
        sectionLabel: string | null;
      };
      const compact = (value: string | null | undefined, max = 1000) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
      const visible = (element: Element) => {
        const style = window.getComputedStyle(element);
        const rect = (element as HTMLElement).getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const labelFor = (element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => {
        if (element.labels?.length) return compact([...element.labels].map((item) => item.textContent ?? '').join(' '));
        const aria = compact(element.getAttribute('aria-label'));
        if (aria) return aria;
        const labelledBy = compact(element.getAttribute('aria-labelledby'));
        if (labelledBy) {
          const text = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
          if (compact(text)) return compact(text);
        }
        const placeholder = compact(element.getAttribute('placeholder'));
        if (placeholder) return placeholder;
        return compact(element.getAttribute('name') || element.getAttribute('id'));
      };
      const descriptionFor = (element: Element) => {
        const ids = compact(element.getAttribute('aria-describedby'));
        if (!ids) return null;
        const text = ids.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
        return compact(text, 2000) || null;
      };
      const sectionFor = (element: Element) => {
        const fieldset = element.closest('fieldset');
        const legend = fieldset?.querySelector('legend')?.textContent;
        if (compact(legend)) return compact(legend);
        const container = element.closest('[role="group"], section, .form-item, .ant-form-item, .el-form-item');
        if (!container) return null;
        const heading = container.querySelector('h1,h2,h3,h4,h5,h6,[class*="title"],[class*="label"]')?.textContent;
        return compact(heading) || null;
      };
      const hintFor = (element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => {
        const values = [element.autocomplete, element.name, element.id, element.getAttribute('placeholder'), element.getAttribute('data-field-name'), element.getAttribute('data-form-field-name')];
        return [...new Set(values.map((value) => compact(value, 240)).filter(Boolean))].slice(0, 100);
      };
      const typeFor = (element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): Snapshot['kind'] => {
        if (element instanceof HTMLTextAreaElement) return 'textarea';
        if (element instanceof HTMLSelectElement) return 'select';
        const type = element.type.toLowerCase();
        if (['text','email','tel','url','number','date','radio','checkbox','file'].includes(type)) return type as Snapshot['kind'];
        return 'unknown';
      };
      const all = [...document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), textarea, select')]
        .filter((node): node is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement => node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement)
        .filter(visible);
      const existingFieldIds = all.map((element) => element.getAttribute('data-job-harness-field-id')).filter((value): value is string => Boolean(value));
      const fieldIdCounts = new Map<string, number>();
      for (const value of existingFieldIds) fieldIdCounts.set(value, (fieldIdCounts.get(value) ?? 0) + 1);
      const reservedFieldIds = new Set(existingFieldIds);
      const usedFieldIds = new Set<string>();
      const allocateFieldId = (element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => {
        const candidate = element.getAttribute('data-job-harness-field-id');
        if (candidate && fieldIdCounts.get(candidate) === 1 && !usedFieldIds.has(candidate)) {
          usedFieldIds.add(candidate);
          return candidate;
        }
        let index = 0;
        let id = `jh-${index}`;
        while (reservedFieldIds.has(id) || usedFieldIds.has(id)) id = `jh-${++index}`;
        element.setAttribute('data-job-harness-field-id', id);
        reservedFieldIds.add(id);
        usedFieldIds.add(id);
        return id;
      };
      const result: Snapshot[] = [];
      const radioGroups = new Map<string, HTMLInputElement[]>();
      for (const element of all) {
        if (element instanceof HTMLInputElement && element.type === 'radio') {
          const key = element.name || `__single_${result.length}_${all.indexOf(element)}`;
          const group = radioGroups.get(key) ?? [];
          group.push(element);
          radioGroups.set(key, group);
          continue;
        }
        const fieldId = allocateFieldId(element);
        const kind = typeFor(element);
        result.push({
          controlRef: `[data-job-harness-field-id="${CSS.escape(fieldId)}"]`,
          kind,
          label: labelFor(element),
          name: compact(element.name, 500) || null,
          description: descriptionFor(element),
          required: element.required || element.getAttribute('aria-required') === 'true',
          disabled: element.disabled,
          readOnly: 'readOnly' in element ? Boolean(element.readOnly) : false,
          options: element instanceof HTMLSelectElement ? [...element.options].map((option) => ({ value: option.value, label: compact(option.textContent, 500), disabled: option.disabled })) : [],
          semanticHints: hintFor(element),
          accept: element instanceof HTMLInputElement && element.type === 'file' ? compact(element.accept, 1000) || null : null,
          multiple: Boolean('multiple' in element && element.multiple),
          sectionLabel: sectionFor(element),
        });
      }
      const radioEntries = [...radioGroups.entries()];
      const radioCandidates = radioEntries.map(([, group]) => {
        const values = [...new Set(group.map((item) => item.getAttribute('data-job-harness-radio-group')).filter((value): value is string => Boolean(value)))];
        return values.length === 1 ? values[0]! : null;
      });
      const radioCandidateCounts = new Map<string, number>();
      for (const value of radioCandidates) if (value) radioCandidateCounts.set(value, (radioCandidateCounts.get(value) ?? 0) + 1);
      const reservedRadioIds = new Set(radioCandidates.filter((value): value is string => Boolean(value)));
      const usedRadioIds = new Set<string>();
      for (let groupIndex = 0; groupIndex < radioEntries.length; groupIndex += 1) {
        const [name, group] = radioEntries[groupIndex]!;
        const first = group[0]!;
        const candidate = radioCandidates[groupIndex];
        let groupId: string;
        if (candidate && radioCandidateCounts.get(candidate) === 1 && !usedRadioIds.has(candidate)) {
          groupId = candidate;
        } else {
          let index = 0;
          groupId = `jhr-${index}`;
          while (reservedRadioIds.has(groupId) || usedRadioIds.has(groupId)) groupId = `jhr-${++index}`;
        }
        usedRadioIds.add(groupId);
        reservedRadioIds.add(groupId);
        for (const item of group) item.setAttribute('data-job-harness-radio-group', groupId);
        result.push({
          controlRef: `[data-job-harness-radio-group="${CSS.escape(groupId)}"]`,
          kind: 'radio',
          label: sectionFor(first) || compact(first.getAttribute('aria-label')) || compact(name),
          name: compact(first.name, 500) || null,
          description: descriptionFor(first),
          required: group.some((item) => item.required || item.getAttribute('aria-required') === 'true'),
          disabled: group.every((item) => item.disabled),
          readOnly: false,
          options: group.map((item) => ({ value: item.value, label: labelFor(item) || compact(item.value, 500), disabled: item.disabled })),
          semanticHints: hintFor(first),
          accept: null,
          multiple: false,
          sectionLabel: sectionFor(first),
        });
      }
      return result;
    });
  }
}
