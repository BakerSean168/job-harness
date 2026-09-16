import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, next = '/jobs') {
  await page.goto(next);
  await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(next).replace(/%/g, '%')}`));
  await expect(page.getByRole('heading', { name: '登录 Job Harness' })).toBeVisible();
  await page.getByLabel('密码').fill('e2e-web-password');
  await Promise.all([
    page.waitForURL((url) => url.pathname === next),
    page.getByRole('button', { name: '登录' }).click(),
  ]);
}

async function expectNoBodyHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    htmlScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  expect(metrics.htmlScrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
}

test('desktop primary workflow: auth -> Jobs -> Application -> export -> logout', async ({ page }) => {
  await login(page);

  await expect(page.getByRole('heading', { name: '岗位' })).toBeVisible();
  const jobLink = page.getByRole('link', { name: 'E2E Agent Engineer' }).first();
  await expect(jobLink).toBeVisible();
  await jobLink.click();
  const jobDialog = page.getByRole('dialog');
  await expect(jobDialog).toBeVisible();
  await expect(jobDialog).toContainText('E2E Labs');
  await page.keyboard.press('Escape');
  await expect(jobDialog).toBeHidden();

  await page.getByRole('link', { name: '投递', exact: true }).click();
  await expect(page.getByRole('heading', { name: '投递' })).toBeVisible();
  const applicationCard = page.locator('.application-card').filter({ hasText: 'E2E Agent Engineer' });
  await expect(applicationCard).toContainText('筛选中');
  await applicationCard.getByLabel('移动到').selectOption('assessment');
  await expect(applicationCard).toContainText('测评');
  await applicationCard.getByRole('link', { name: 'E2E Agent Engineer' }).click();
  const applicationDialog = page.getByRole('dialog');
  await expect(applicationDialog).toContainText('E2E Agent Resume');
  await page.keyboard.press('Escape');
  await expect(applicationDialog).toBeHidden();

  await page.getByRole('link', { name: '设置', exact: true }).click();
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();
  const dataPanel = page.locator('.settings-panel').filter({ hasText: '数据与备份' });
  const exportDownloadPromise = page.waitForEvent('download');
  await dataPanel.getByRole('link', { name: '下载' }).first().click();
  const exportDownload = await exportDownloadPromise;
  expect(exportDownload.suggestedFilename()).toMatch(/^job-harness-export-.*\.json$/);
  const exportPath = await exportDownload.path();
  expect(exportPath).not.toBeNull();
  const snapshot = JSON.parse(await readFile(exportPath!, 'utf8')) as {
    jobs: unknown[];
    applications: unknown[];
    resumes: unknown[];
  };
  expect(snapshot.jobs).toHaveLength(1);
  expect(snapshot.applications).toHaveLength(1);
  expect(snapshot.resumes).toHaveLength(1);

  await Promise.all([
    page.waitForURL((url) => url.pathname === '/login'),
    page.getByRole('button', { name: '退出登录' }).click(),
  ]);
  await expect(page.getByRole('heading', { name: '登录 Job Harness' })).toBeVisible();
});

test('390px mobile workspace keeps body contained and primary navigation usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await expectNoBodyHorizontalOverflow(page);

  const mobileNav = page.locator('.app-sidebar');
  const navBox = await mobileNav.boundingBox();
  expect(navBox).not.toBeNull();
  expect(navBox!.x).toBeLessThanOrEqual(1);
  expect(navBox!.width).toBeGreaterThanOrEqual(389);
  expect(Math.abs(navBox!.y + navBox!.height - 844)).toBeLessThanOrEqual(2);

  const jobsScroller = page.locator('.jobs-table-scroll');
  const jobsScrollMetrics = await jobsScroller.evaluate((node) => ({
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
  }));
  expect(jobsScrollMetrics.scrollWidth).toBeGreaterThan(jobsScrollMetrics.clientWidth);

  await page.getByRole('link', { name: 'E2E Agent Engineer' }).first().click();
  const dialog = page.getByRole('dialog');
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox).not.toBeNull();
  expect(dialogBox!.x).toBeLessThanOrEqual(1);
  expect(dialogBox!.width).toBeGreaterThanOrEqual(389);
  expect(dialogBox!.height).toBeGreaterThanOrEqual(843);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.getByRole('link', { name: '投递', exact: true }).click();
  await expect(page.getByRole('heading', { name: '投递' })).toBeVisible();
  await expectNoBodyHorizontalOverflow(page);
  const boardScroller = page.locator('.applications-board-scroll').first();
  const boardMetrics = await boardScroller.evaluate((node) => ({
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
  }));
  expect(boardMetrics.scrollWidth).toBeGreaterThan(boardMetrics.clientWidth);
  const firstLane = page.locator('.application-lane').first();
  const laneBox = await firstLane.boundingBox();
  expect(laneBox).not.toBeNull();
  expect(laneBox!.width).toBeGreaterThan(250);
  expect(laneBox!.width).toBeLessThan(390);

  await page.getByRole('link', { name: '设置', exact: true }).click();
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();
  await expectNoBodyHorizontalOverflow(page);
  const downloadLink = page.locator('.settings-download-row .action-button').first();
  const downloadBox = await downloadLink.boundingBox();
  const settingsPanelBox = await page.locator('.settings-panel').last().boundingBox();
  expect(downloadBox).not.toBeNull();
  expect(settingsPanelBox).not.toBeNull();
  expect(downloadBox!.width).toBeGreaterThan(settingsPanelBox!.width * 0.9);
});
