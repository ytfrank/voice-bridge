import { test, expect } from '@playwright/test';

/**
 * VoiceBridge Web E2E 测试
 * 验证目标：iOS录音修复（expo-av → expo-audio）后，Web端无模块加载错误
 * Commit: fix(ios): use correct expo-audio enum values for recording options
 */

test.describe('VoiceBridge E2E - iOS录音修复验证', () => {
  const jsErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    jsErrors.length = 0;
    page.on('console', msg => {
      if (msg.type() === 'error') jsErrors.push(msg.text());
    });
    page.on('pageerror', err => jsErrors.push(err.message));
  });

  test('1. 主界面加载 - 无致命模块错误', async ({ page }) => {
    await page.goto('http://localhost:19006', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'tests/screenshots/01_home.png', fullPage: true });

    // 重点：expo-audio 迁移后不应有模块加载错误
    const moduleErrors = jsErrors.filter(e =>
      e.includes('expo-audio') ||
      e.includes('useAudioRecorder') ||
      e.includes('IOSOutputFormat') ||
      e.includes('AudioQuality') ||
      e.includes('Cannot find module') ||
      e.includes('setAudioModeAsync')
    );
    expect(moduleErrors, `expo-audio 模块错误: ${moduleErrors.join('\n')}`).toHaveLength(0);
  });

  test('2. 录音控件正常渲染', async ({ page }) => {
    await page.goto('http://localhost:19006', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // 查找录音相关按钮/文字
    const startBtn = page.getByText(/开始|Start|录音|Record|Listen/i).first();
    await expect(startBtn).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: 'tests/screenshots/02_controls.png', fullPage: true });
  });

  test('3. 无 TypeError / ReferenceError 崩溃', async ({ page }) => {
    await page.goto('http://localhost:19006', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(5000);

    const crashErrors = jsErrors.filter(e =>
      (e.includes('TypeError') || e.includes('ReferenceError')) &&
      !e.includes('ResizeObserver') // 忽略 ResizeObserver 无害错误
    );
    await page.screenshot({ path: 'tests/screenshots/03_stable.png', fullPage: true });
    expect(crashErrors, `JS崩溃错误: ${crashErrors.join('\n')}`).toHaveLength(0);
  });

  test('4. 完整页面结构验证', async ({ page }) => {
    await page.goto('http://localhost:19006', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // App 根节点存在（React Native Web 渲染正常）
    const root = page.locator('#root, [data-testid="root"], body > div');
    await expect(root.first()).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/04_full_page.png', fullPage: true });
    console.log('所有 JS 错误:', jsErrors);
  });
});
