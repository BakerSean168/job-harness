import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import { PlaywrightBrowserDriver } from '../src/playwright-driver';

const driverPath = fileURLToPath(new URL('../../../integrations/browser-extension/page-driver.js', import.meta.url));

async function withDriver<T>(run: (page: import('playwright').Page) => Promise<T>): Promise<T> {
  const html = `<!doctype html><style>input,select,button{display:block;width:180px;height:30px;margin:8px}.job-apply-trigger{display:block;width:180px;height:30px;margin:8px;cursor:pointer}</style>
      <form><fieldset><legend>基本信息</legend>
        <label>姓名 <input id="name" name="name" required></label>
        <label>邮箱 <input id="email" type="email" name="email" required></label>
        <label>学历 <select id="degree" name="degree" required><option value="">请选择</option><option value="bachelor">本科</option></select></label>
        <label>简历 <input id="resume" type="file" name="resume" accept="application/pdf,.pdf" required></label>
      </fieldset><button id="next" type="button">继续</button><div id="custom-apply" class="job-apply-trigger">立即投递</div></form>`;
  const server = createServer((_req, res) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(html); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fixture server did not bind');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.evaluate(() => {
      (globalThis as unknown as { __jhListener?: unknown; chrome?: unknown }).chrome = {
        runtime: {
          onMessage: {
            addListener(listener: unknown) { (globalThis as unknown as { __jhListener?: unknown }).__jhListener = listener; },
          },
        },
      };
    });
    await page.addScriptTag({ content: await readFile(driverPath, 'utf8') });
    return await run(page);
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function command(page: import('playwright').Page, type: string, payload: Record<string, unknown> = {}) {
  return page.evaluate(async ({ type, payload }) => {
    const listener = (globalThis as unknown as { __jhListener?: (message: unknown, sender: unknown, sendResponse: (value: unknown) => void) => boolean }).__jhListener;
    if (!listener) throw new Error('page driver listener missing');
    return new Promise<unknown>((resolve, reject) => {
      const keepAlive = listener({ type: 'JH_PAGE_DRIVER_COMMAND', command: { type, payload } }, null, (value) => {
        if (value && typeof value === 'object' && '__jobHarnessDriverError' in value) reject(new Error(String((value as Record<string, unknown>).__jobHarnessDriverError)));
        else resolve(value);
      });
      if (!keepAlive) reject(new Error('page driver did not keep async response alive'));
    });
  }, { type, payload });
}

describe('MV3 page driver contract', () => {
  it('scans canonical controls/actions, writes native values, uploads a PDF and produces a stable form hash', async () => {
    await withDriver(async (page) => {
      const controls = await command(page, 'scan_controls') as Array<Record<string, unknown>>;
      expect(controls).toHaveLength(4);
      const name = controls.find((field) => field.name === 'name');
      const degree = controls.find((field) => field.name === 'degree');
      const resume = controls.find((field) => field.name === 'resume');
      expect(name).toMatchObject({ kind: 'text', required: true, sectionLabel: '基本信息' });
      expect(degree).toMatchObject({ kind: 'select', required: true });
      expect(resume).toMatchObject({ kind: 'file', required: true, accept: 'application/pdf,.pdf' });

      await command(page, 'fill', { selector: name!.controlRef, value: 'Fixture User' });
      await command(page, 'select', { selector: degree!.controlRef, value: 'bachelor' });
      const pdfBytes = Buffer.from('%PDF-1.7\nfixture\n%%EOF').toString('base64');
      await command(page, 'upload', { selector: resume!.controlRef, file: { name: 'resume.pdf', mimeType: 'application/pdf', bytesBase64: pdfBytes } });

      expect(await page.inputValue('#name')).toBe('Fixture User');
      expect(await page.inputValue('#degree')).toBe('bachelor');
      expect(await page.locator('#resume').evaluate((element: HTMLInputElement) => ({ name: element.files?.[0]?.name, type: element.files?.[0]?.type, size: element.files?.[0]?.size }))).toMatchObject({ name: 'resume.pdf', type: 'application/pdf', size: expect.any(Number) });

      const actions = await command(page, 'scan_actions') as Array<Record<string, unknown>>;
      expect(actions).toEqual(expect.arrayContaining([expect.objectContaining({ tag: 'button', text: '继续', disabled: false })]));
      expect(actions).toEqual(expect.arrayContaining([expect.objectContaining({ tag: 'other', text: '立即投递', disabled: false })]));
      const firstHash = await command(page, 'form_state_hash');
      expect(firstHash).toMatch(/^[a-f0-9]{64}$/);
      await command(page, 'fill', { selector: name!.controlRef, value: 'Changed User' });
      const secondHash = await command(page, 'form_state_hash');
      expect(secondHash).toMatch(/^[a-f0-9]{64}$/);
      expect(secondHash).not.toBe(firstHash);
    });
  });

  it('keeps MV3 control/action refs unique and stable when a dynamic form inserts earlier elements', async () => {
    await withDriver(async (page) => {
      const initialControls = await command(page, 'scan_controls') as Array<Record<string, unknown>>;
      const initialActions = await command(page, 'scan_actions') as Array<Record<string, unknown>>;
      const nameRef = String(initialControls.find((field) => field.name === 'name')!.controlRef);
      const nextRef = String(initialActions.find((action) => action.text === '继续')!.actionRef);

      await page.evaluate(() => {
        const form = document.querySelector('form')!;
        const injected = document.createElement('input');
        injected.id = 'conditional'; injected.name = 'conditional'; injected.style.cssText = 'display:block;width:180px;height:30px';
        form.insertBefore(injected, form.firstChild);
        const action = document.createElement('button');
        action.id = 'conditional-action'; action.type = 'button'; action.textContent = '条件操作'; action.style.cssText = 'display:block;width:180px;height:30px';
        form.insertBefore(action, document.getElementById('next'));
      });

      const rescannedControls = await command(page, 'scan_controls') as Array<Record<string, unknown>>;
      const rescannedActions = await command(page, 'scan_actions') as Array<Record<string, unknown>>;
      const controlRefs = rescannedControls.map((field) => String(field.controlRef));
      const actionRefs = rescannedActions.map((action) => String(action.actionRef));
      expect(new Set(controlRefs).size).toBe(controlRefs.length);
      expect(new Set(actionRefs).size).toBe(actionRefs.length);
      expect(String(rescannedControls.find((field) => field.name === 'name')!.controlRef)).toBe(nameRef);
      expect(String(rescannedActions.find((action) => action.text === '继续')!.actionRef)).toBe(nextRef);
      expect(await page.locator(nameRef).count()).toBe(1);
      expect(await page.locator(nextRef).count()).toBe(1);

      await command(page, 'fill', { selector: nameRef, value: 'Stable Target' });
      expect(await page.inputValue('#name')).toBe('Stable Target');
      expect(await page.inputValue('#conditional')).toBe('');
    });
  });

  it('keeps Playwright backend control/action refs unique and stable after dynamic insertion', async () => {
    await withDriver(async (page) => {
      const driver = new PlaywrightBrowserDriver(page);
      const initialControls = await driver.scanControls();
      const initialActions = await driver.scanActions();
      const nameRef = initialControls.find((field) => field.name === 'name')!.controlRef;
      const nextRef = initialActions.find((action) => action.text === '继续')!.actionRef;

      await page.evaluate(() => {
        const form = document.querySelector('form')!;
        const injected = document.createElement('input');
        injected.id = 'conditional'; injected.name = 'conditional'; injected.style.cssText = 'display:block;width:180px;height:30px';
        form.insertBefore(injected, form.firstChild);
        const action = document.createElement('button');
        action.id = 'conditional-action'; action.type = 'button'; action.textContent = '条件操作'; action.style.cssText = 'display:block;width:180px;height:30px';
        form.insertBefore(action, document.getElementById('next'));
      });

      const rescannedControls = await driver.scanControls();
      const rescannedActions = await driver.scanActions();
      expect(new Set(rescannedControls.map((field) => field.controlRef)).size).toBe(rescannedControls.length);
      expect(new Set(rescannedActions.map((action) => action.actionRef)).size).toBe(rescannedActions.length);
      expect(rescannedControls.find((field) => field.name === 'name')!.controlRef).toBe(nameRef);
      expect(rescannedActions.find((action) => action.text === '继续')!.actionRef).toBe(nextRef);
      expect(await page.locator(nameRef).count()).toBe(1);
      expect(await page.locator(nextRef).count()).toBe(1);

      await driver.fill(nameRef, 'Stable Target');
      expect(await page.inputValue('#name')).toBe('Stable Target');
      expect(await page.inputValue('#conditional')).toBe('');
    });
  });


  it('binds the reviewed form hash to the exact page URL in both browser backends', async () => {
    await withDriver(async (page) => {
      const mv3Before = await command(page, 'form_state_hash');
      const playwright = new PlaywrightBrowserDriver(page);
      const pwBefore = await playwright.formStateHash();
      await page.evaluate(() => history.pushState({}, '', '/different-application?step=review#confirm'));
      const mv3After = await command(page, 'form_state_hash');
      const pwAfter = await playwright.formStateHash();
      expect(mv3After).not.toBe(mv3Before);
      expect(pwAfter).not.toBe(pwBefore);
    });
  });


  it('binds the reviewed form hash to exact uploaded file bytes across MV3 and Playwright backends', async () => {
    await withDriver(async (page) => {
      await command(page, 'scan_controls');
      const playwright = new PlaywrightBrowserDriver(page);
      const setResumeBytes = async (bytes: number[]) => page.evaluate((payload) => {
        const input = document.querySelector('#resume');
        if (!(input instanceof HTMLInputElement)) throw new Error('resume input missing');
        const file = new File([new Uint8Array(payload)], 'resume.pdf', {
          type: 'application/pdf',
          lastModified: 1_700_000_000_000,
        });
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, bytes);

      await setResumeBytes([37, 80, 68, 70, 45, 65]); // %PDF-A
      const mv3First = await command(page, 'form_state_hash');
      const playwrightFirst = await playwright.formStateHash();
      expect(playwrightFirst).toBe(mv3First);

      await setResumeBytes([37, 80, 68, 70, 45, 66]); // %PDF-B: same metadata/size, different content
      const mv3Second = await command(page, 'form_state_hash');
      const playwrightSecond = await playwright.formStateHash();
      expect(playwrightSecond).toBe(mv3Second);
      expect(mv3Second).not.toBe(mv3First);
    });
  });

});
