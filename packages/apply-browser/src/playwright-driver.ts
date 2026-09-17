import type { Page } from 'playwright';
import type { BrowserDriverPort, BrowserUploadFile } from './types';

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
    await this.page.locator(selector).first().selectOption(Array.isArray(value) ? [...value] : value);
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
}
