import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { chromium } from 'playwright';

const driverPath = fileURLToPath(new URL('../../../integrations/browser-extension/page-driver.js', import.meta.url));

async function withDriver<T>(run: (page: import('playwright').Page) => Promise<T>): Promise<T> {
  const html = `<!doctype html><style>input,select,button{display:block;width:180px;height:30px;margin:8px}</style>
      <form><fieldset><legend>基本信息</legend>
        <label>姓名 <input id="name" name="name" required></label>
        <label>邮箱 <input id="email" type="email" name="email" required></label>
        <label>学历 <select id="degree" name="degree" required><option value="">请选择</option><option value="bachelor">本科</option></select></label>
        <label>简历 <input id="resume" type="file" name="resume" accept="application/pdf,.pdf" required></label>
      </fieldset><button id="next" type="button">继续</button></form>`;
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
      const firstHash = await command(page, 'form_state_hash');
      expect(firstHash).toMatch(/^[a-f0-9]{64}$/);
      await command(page, 'fill', { selector: name!.controlRef, value: 'Changed User' });
      const secondHash = await command(page, 'form_state_hash');
      expect(secondHash).toMatch(/^[a-f0-9]{64}$/);
      expect(secondHash).not.toBe(firstHash);
    });
  });
});
