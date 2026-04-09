import { test, expect } from '@playwright/test';
import path from 'path';

const SHORT = path.resolve('tests/fixtures/audio/en_short_21s_musk.wav');
const MEDIUM = path.resolve('tests/fixtures/audio/en_medium_30s_climate.wav');
const LONG = path.resolve('tests/fixtures/audio/en_medium_3min_ai.wav');

async function runFileScenario(page, filePath: string, label: string, shotPrefix: string) {
  await page.goto('http://localhost:3001/static/test.html', { waitUntil: 'networkidle', timeout: 30000 });
  await page.screenshot({ path: `tests/artifacts/v17/${shotPrefix}_01_page.png`, fullPage: true });

  await page.locator('#audioFile').setInputFiles(filePath);
  await page.screenshot({ path: `tests/artifacts/v17/${shotPrefix}_02_selected.png`, fullPage: true });

  const start = Date.now();
  await page.click('#btnFile');
  await expect(page.locator('#fileResult')).not.toContainText('等待测试', { timeout: 120000 });
  const elapsed = Date.now() - start;
  await page.screenshot({ path: `tests/artifacts/v17/${shotPrefix}_03_result.png`, fullPage: true });

  const resultText = await page.locator('#fileResult').innerText();
  return { label, elapsed, resultText };
}

test.use({
  viewport: { width: 1440, height: 1100 },
  video: { mode: 'on', size: { width: 1280, height: 720 } }
});

test.describe('V1.7 Web evidence', () => {
  test('web app load evidence + file upload scenarios', async ({ page }, testInfo) => {
    const webErrors: string[] = [];
    page.on('console', msg => { if (['error', 'warning'].includes(msg.type())) webErrors.push(`[console:${msg.type()}] ${msg.text()}`); });
    page.on('pageerror', err => webErrors.push(`[pageerror] ${err.message}`));

    // 1) Web 模式 App 证据
    await page.goto('http://localhost:3002', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'tests/artifacts/v17/webapp_01_loaded.png', fullPage: true });
    const webHtml = await page.content();

    // 2) 测试页短/中/长文件场景
    const shortRes = await runFileScenario(page, SHORT, 'short_21s_musk', 'short');
    const mediumRes = await runFileScenario(page, MEDIUM, 'medium_30s_climate', 'medium');
    const longRes = await runFileScenario(page, LONG, 'long_3min_ai', 'long');

    // 3) 健康检查页面证据
    await page.goto('http://localhost:3001/static/test.html', { waitUntil: 'networkidle', timeout: 30000 });
    await page.getByRole('button', { name: '检查' }).click();
    await expect(page.locator('#healthResult')).not.toContainText('等待检查', { timeout: 10000 });
    await page.screenshot({ path: 'tests/artifacts/v17/health_01_result.png', fullPage: true });
    const health = await page.locator('#healthResult').innerText();

    await testInfo.attach('web-errors.json', {
      body: Buffer.from(JSON.stringify(webErrors, null, 2)),
      contentType: 'application/json'
    });
    await testInfo.attach('webapp.html', {
      body: Buffer.from(webHtml),
      contentType: 'text/html'
    });
    await testInfo.attach('scenario-summary.json', {
      body: Buffer.from(JSON.stringify({ shortRes, mediumRes, longRes, health }, null, 2)),
      contentType: 'application/json'
    });

    // 关键断言：测试页面三类文件流全部跑通
    expect(shortRes.resultText.length).toBeGreaterThan(20);
    expect(mediumRes.resultText.length).toBeGreaterThan(20);
    expect(longRes.resultText.length).toBeGreaterThan(20);
  });
});
