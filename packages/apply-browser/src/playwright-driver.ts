import type { Page } from 'playwright';
import type { BrowserControlSnapshot, BrowserDriverPort, BrowserUploadFile } from './types';

export class PlaywrightBrowserDriver implements BrowserDriverPort {
  constructor(private readonly page: Page) {}

  async navigate(url: string): Promise<void> {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`Unsupported navigation protocol: ${parsed.protocol}`);
    await this.page.goto(parsed.toString(), { waitUntil: 'domcontentloaded', timeout: 45_000 });
  }

  currentUrl(): string { return this.page.url(); }
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

  async click(selector: string): Promise<void> {
    await this.page.locator(selector).first().click();
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

  async scanControls(): Promise<readonly BrowserControlSnapshot[]> {
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
        const fieldId = element.getAttribute('data-job-harness-field-id') || `jh-${all.indexOf(element)}`;
        element.setAttribute('data-job-harness-field-id', fieldId);
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
      for (const [name, group] of radioGroups) {
        const first = group[0]!;
        const groupId = first.getAttribute('data-job-harness-radio-group') || `jhr-${result.length}`;
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
