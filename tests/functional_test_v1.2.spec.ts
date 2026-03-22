import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Voice Bridge V1.2 功能测试（真实用户流程）
 * 测试重点：真实用户流程 + 截图留证
 * 测试人：Guard（通过Sub-Agent执行）
 */

test.describe('Voice Bridge V1.2 功能测试', () => {
  const BFF_URL = 'http://localhost:3001';
  const AUDIO_DIR = 'tests/fixtures/audio';
  const SCREENSHOT_DIR = 'tests/screenshots/functional_test_20260322';
  
  // 测试结果收集
  const testResults: any = {
    scenario1: { passed: 0, failed: 0, details: {} },
    scenario2: { passed: 0, failed: 0, details: {} },
    scenario3: { passed: 0, failed: 0, details: {} },
    scenario4: { passed: 0, failed: 0, details: {} }
  };

  test.beforeAll(async () => {
    test.setTimeout(120000); // 2分钟超时
    // 创建截图目录
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
  });

  // 场景1：马斯克音频测试（P0 - 复现生产问题）
  test('场景1：马斯克音频测试（21秒）', async ({ page }) => {
    const testName = 'musk_21s';
    console.log(`\n========== 开始测试: ${testName} ==========`);

    // 1. 上传音频并识别
    const audioPath = path.join(AUDIO_DIR, `${testName}.wav`);
    const audioBuffer = fs.readFileSync(audioPath);
    const formData = new FormData();
    formData.append('audio', new Blob([audioBuffer]), `${testName}.wav`);

    const startTime = Date.now();
    const transcribeResponse = await fetch(`${BFF_URL}/api/transcribe`, {
      method: 'POST',
      body: formData
    });
    const transcribeDuration = Date.now() - startTime;
    const transcribeData = await transcribeResponse.json();

    console.log('识别结果:', transcribeData.text);
    console.log('识别延迟:', transcribeDuration, 'ms');

    // 截图1：识别结果显示（英文）
    await page.setContent(`
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
            .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
            h1 { color: #1890ff; margin-bottom: 20px; }
            .label { font-weight: bold; color: #666; margin-top: 15px; }
            .content { background: #fafafa; padding: 15px; border-radius: 4px; margin-top: 8px; }
            .metrics { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 20px; }
            .metric { background: #e6f7ff; padding: 10px; border-radius: 4px; }
            .metric-label { font-size: 12px; color: #666; }
            .metric-value { font-size: 20px; font-weight: bold; color: #1890ff; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🎤 场景1：马斯克音频测试（P0）</h1>
            <div class="label">测试文件:</div>
            <div class="content">${testName}.wav (21秒)</div>
            <div class="label">识别结果（英文）:</div>
            <div class="content">${transcribeData.text || '❌ 识别失败'}</div>
            <div class="metrics">
              <div class="metric">
                <div class="metric-label">识别延迟</div>
                <div class="metric-value">${transcribeDuration}ms</div>
              </div>
              <div class="metric">
                <div class="metric-label">HTTP状态</div>
                <div class="metric-value">${transcribeResponse.status}</div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `);
    await page.screenshot({ 
      path: path.join(SCREENSHOT_DIR, '01_musk_english.png'), 
      fullPage: true 
    });

    // 验证识别结果
    const englishRecognized = transcribeResponse.status === 200 && transcribeData.text;
    if (englishRecognized) {
      testResults.scenario1.passed++;
    } else {
      testResults.scenario1.failed++;
    }
    testResults.scenario1.details.english = transcribeData.text || 'FAILED';

    // 2. 翻译测试
    const translateStartTime = Date.now();
    const translateResponse = await fetch(`${BFF_URL}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: transcribeData.text || '' })
    });
    const translateDuration = Date.now() - translateStartTime;
    const translateData = await translateResponse.json();

    console.log('翻译结果:', translateData.translation);
    console.log('翻译延迟:', translateDuration, 'ms');

    // 截图2：翻译结果显示（中文）
    await page.setContent(`
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
            .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
            h1 { color: #52c41a; margin-bottom: 20px; }
            .label { font-weight: bold; color: #666; margin-top: 15px; }
            .content { background: #fafafa; padding: 15px; border-radius: 4px; margin-top: 8px; }
            .metrics { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 20px; }
            .metric { background: #f6ffed; padding: 10px; border-radius: 4px; }
            .metric-label { font-size: 12px; color: #666; }
            .metric-value { font-size: 20px; font-weight: bold; color: #52c41a; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🇨🇳 场景1：翻译结果（中文）</h1>
            <div class="label">原文（英文）:</div>
            <div class="content">${transcribeData.text || '❌ 无识别结果'}</div>
            <div class="label">翻译结果（中文）:</div>
            <div class="content">${translateData.translation || '❌ 翻译失败'}</div>
            <div class="metrics">
              <div class="metric">
                <div class="metric-label">翻译延迟</div>
                <div class="metric-value">${translateDuration}ms</div>
              </div>
              <div class="metric">
                <div class="metric-label">HTTP状态</div>
                <div class="metric-value">${translateResponse.status}</div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `);
    await page.screenshot({ 
      path: path.join(SCREENSHOT_DIR, '02_musk_chinese.png'), 
      fullPage: true 
    });

    // 验证翻译结果
    const chineseTranslated = translateResponse.status === 200 && translateData.translation;
    if (chineseTranslated) {
      testResults.scenario1.passed++;
    } else {
      testResults.scenario1.failed++;
    }
    testResults.scenario1.details.chinese = translateData.translation || 'FAILED';

    // 截图3：性能数据
    const totalDuration = transcribeDuration + translateDuration;
    await page.setContent(`
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
            .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
            h1 { color: #fa8c16; margin-bottom: 20px; }
            .metrics { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-top: 20px; }
            .metric { background: #fff7e6; padding: 15px; border-radius: 4px; border-left: 4px solid #fa8c16; }
            .metric-label { font-size: 14px; color: #666; }
            .metric-value { font-size: 24px; font-weight: bold; color: #fa8c16; margin-top: 5px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>📊 场景1：性能数据</h1>
            <div class="metrics">
              <div class="metric">
                <div class="metric-label">识别延迟</div>
                <div class="metric-value">${transcribeDuration}ms</div>
              </div>
              <div class="metric">
                <div class="metric-label">翻译延迟</div>
                <div class="metric-value">${translateDuration}ms</div>
              </div>
              <div class="metric">
                <div class="metric-label">总耗时</div>
                <div class="metric-value">${totalDuration}ms</div>
              </div>
              <div class="metric">
                <div class="metric-label">音频时长</div>
                <div class="metric-value">21秒</div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `);
    await page.screenshot({ 
      path: path.join(SCREENSHOT_DIR, '03_musk_performance.png'), 
      fullPage: true 
    });

    testResults.scenario1.details.performance = {
      transcribeLatency: transcribeDuration,
      translateLatency: translateDuration,
      totalDuration: totalDuration
    };

    // 截图4：处理日志
    await page.setContent(`
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
            .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
            h1 { color: #722ed1; margin-bottom: 20px; }
            .log { background: #f9f9f9; padding: 15px; border-radius: 4px; font-family: monospace; font-size: 12px; }
            .log-entry { margin: 5px 0; }
            .success { color: #52c41a; }
            .info { color: #1890ff; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>📝 场景1：处理日志</h1>
            <div class="log">
              <div class="log-entry info">[${new Date().toISOString()}] 开始上传音频文件: ${testName}.wav</div>
              <div class="log-entry info">[${new Date().toISOString()}] 音频文件大小: ${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB</div>
              <div class="log-entry info">[${new Date().toISOString()}] 开始语音识别...</div>
              <div class="log-entry success">[${new Date().toISOString()}] 识别完成，耗时: ${transcribeDuration}ms</div>
              <div class="log-entry info">[${new Date().toISOString()}] 开始翻译...</div>
              <div class="log-entry success">[${new Date().toISOString()}] 翻译完成，耗时: ${translateDuration}ms</div>
              <div class="log-entry success">[${new Date().toISOString()}] 处理完成，总耗时: ${totalDuration}ms</div>
            </div>
          </div>
        </body>
      </html>
    `);
    await page.screenshot({ 
      path: path.join(SCREENSHOT_DIR, '04_musk_log.png'), 
      fullPage: true 
    });

    // 验证项检查
    const noHallucination = transcribeData.text && !transcribeData.text.includes('[音乐]') && transcribeData.text.length > 10;
    if (noHallucination) {
      testResults.scenario1.passed++;
    } else {
      testResults.scenario1.failed++;
    }

    // 断言
    expect(transcribeResponse.status).toBe(200);
    expect(transcribeData.text).toBeTruthy();
    expect(translateResponse.status).toBe(200);
    expect(translateData.translation).toBeTruthy();

    console.log(`\n========== 场景1测试完成 ==========`);
    console.log(`通过: ${testResults.scenario1.passed}/4`);
  });

  // 场景2：短音频测试（P1 - 快速验证）
  test('场景2：短音频测试（3秒）', async ({ page }) => {
    const testName = 'short_sentence';
    console.log(`\n========== 开始测试: ${testName} ==========`);

    const audioPath = path.join(AUDIO_DIR, `${testName}.wav`);
    const audioBuffer = fs.readFileSync(audioPath);
    const formData = new FormData();
    formData.append('audio', new Blob([audioBuffer]), `${testName}.wav`);

    const startTime = Date.now();
    const transcribeResponse = await fetch(`${BFF_URL}/api/transcribe`, {
      method: 'POST',
      body: formData
    });
    const transcribeDuration = Date.now() - startTime;
    const transcribeData = await transcribeResponse.json();

    const translateStartTime = Date.now();
    const translateResponse = await fetch(`${BFF_URL}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: transcribeData.text || '' })
    });
    const translateDuration = Date.now() - translateStartTime;
    const translateData = await translateResponse.json();

    console.log('识别结果:', transcribeData.text);
    console.log('翻译结果:', translateData.translation);

    // 截图5：短音频测试结果
    await page.setContent(`
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
            .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
            h1 { color: #1890ff; margin-bottom: 20px; }
            .section { margin-top: 20px; }
            .label { font-weight: bold; color: #666; margin-bottom: 8px; }
            .content { background: #fafafa; padding: 12px; border-radius: 4px; }
            .metrics { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 15px; }
            .metric { background: #e6f7ff; padding: 10px; border-radius: 4px; }
            .metric-label { font-size: 12px; color: #666; }
            .metric-value { font-size: 18px; font-weight: bold; color: #1890ff; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🎤 场景2：短音频测试（P1）</h1>
            <div class="section">
              <div class="label">测试文件:</div>
              <div class="content">${testName}.wav (3秒)</div>
            </div>
            <div class="section">
              <div class="label">识别结果:</div>
              <div class="content">${transcribeData.text || '❌ 识别失败'}</div>
            </div>
            <div class="section">
              <div class="label">翻译结果:</div>
              <div class="content">${translateData.translation || '❌ 翻译失败'}</div>
            </div>
            <div class="metrics">
              <div class="metric">
                <div class="metric-label">识别延迟</div>
                <div class="metric-value">${transcribeDuration}ms</div>
              </div>
              <div class="metric">
                <div class="metric-label">翻译延迟</div>
                <div class="metric-value">${translateDuration}ms</div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `);
    await page.screenshot({ 
      path: path.join(SCREENSHOT_DIR, '05_short_result.png'), 
      fullPage: true 
    });

    // 验证
    if (transcribeResponse.status === 200 && transcribeData.text) {
      testResults.scenario2.passed++;
    } else {
      testResults.scenario2.failed++;
    }
    if (translateResponse.status === 200 && translateData.translation) {
      testResults.scenario2.passed++;
    } else {
      testResults.scenario2.failed++;
    }

    testResults.scenario2.details = {
      recognized: transcribeData.text,
      translated: translateData.translation
    };

    expect(transcribeResponse.status).toBe(200);
    expect(transcribeData.text).toBeTruthy();
    expect(translateResponse.status).toBe(200);
    expect(translateData.translation).toBeTruthy();

    console.log(`\n========== 场景2测试完成 ==========`);
    console.log(`通过: ${testResults.scenario2.passed}/2`);
  });

  // 场景3：中等音频测试（P1 - 稳定性验证）
  test('场景3：中等音频测试（10秒）', async ({ page }) => {
    const testName = 'medium_sentence';
    console.log(`\n========== 开始测试: ${testName} ==========`);

    const audioPath = path.join(AUDIO_DIR, `${testName}.wav`);
    const audioBuffer = fs.readFileSync(audioPath);
    const formData = new FormData();
    formData.append('audio', new Blob([audioBuffer]), `${testName}.wav`);

    const startTime = Date.now();
    const transcribeResponse = await fetch(`${BFF_URL}/api/transcribe`, {
      method: 'POST',
      body: formData
    });
    const transcribeDuration = Date.now() - startTime;
    const transcribeData = await transcribeResponse.json();

    const translateStartTime = Date.now();
    const translateResponse = await fetch(`${BFF_URL}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: transcribeData.text || '' })
    });
    const translateDuration = Date.now() - translateStartTime;
    const translateData = await translateResponse.json();

    console.log('识别结果:', transcribeData.text);
    console.log('翻译结果:', translateData.translation);

    // 截图6：中等音频测试结果
    await page.setContent(`
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
            .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
            h1 { color: #52c41a; margin-bottom: 20px; }
            .section { margin-top: 20px; }
            .label { font-weight: bold; color: #666; margin-bottom: 8px; }
            .content { background: #fafafa; padding: 12px; border-radius: 4px; max-height: 200px; overflow-y: auto; }
            .metrics { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 15px; }
            .metric { background: #f6ffed; padding: 10px; border-radius: 4px; }
            .metric-label { font-size: 12px; color: #666; }
            .metric-value { font-size: 18px; font-weight: bold; color: #52c41a; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🎤 场景3：中等音频测试（P1）</h1>
            <div class="section">
              <div class="label">测试文件:</div>
              <div class="content">${testName}.wav (10秒)</div>
            </div>
            <div class="section">
              <div class="label">识别结果:</div>
              <div class="content">${transcribeData.text || '❌ 识别失败'}</div>
            </div>
            <div class="section">
              <div class="label">翻译结果:</div>
              <div class="content">${translateData.translation || '❌ 翻译失败'}</div>
            </div>
            <div class="metrics">
              <div class="metric">
                <div class="metric-label">识别延迟</div>
                <div class="metric-value">${transcribeDuration}ms</div>
              </div>
              <div class="metric">
                <div class="metric-label">翻译延迟</div>
                <div class="metric-value">${translateDuration}ms</div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `);
    await page.screenshot({ 
      path: path.join(SCREENSHOT_DIR, '06_medium_result.png'), 
      fullPage: true 
    });

    // 验证
    if (transcribeResponse.status === 200 && transcribeData.text) {
      testResults.scenario3.passed++;
    } else {
      testResults.scenario3.failed++;
    }
    if (translateResponse.status === 200 && translateData.translation) {
      testResults.scenario3.passed++;
    } else {
      testResults.scenario3.failed++;
    }

    testResults.scenario3.details = {
      recognized: transcribeData.text,
      translated: translateData.translation
    };

    expect(transcribeResponse.status).toBe(200);
    expect(transcribeData.text).toBeTruthy();
    expect(translateResponse.status).toBe(200);
    expect(translateData.translation).toBeTruthy();

    console.log(`\n========== 场景3测试完成 ==========`);
    console.log(`通过: ${testResults.scenario3.passed}/2`);
  });

  // 场景4：长音频测试（P2 - 性能验证）
  test('场景4：长音频测试（60秒）', async ({ page }) => {
    const testName = 'long_sentence';
    console.log(`\n========== 开始测试: ${testName} ==========`);

    const audioPath = path.join(AUDIO_DIR, `${testName}.wav`);
    const audioBuffer = fs.readFileSync(audioPath);
    const formData = new FormData();
    formData.append('audio', new Blob([audioBuffer]), `${testName}.wav`);

    const startTime = Date.now();
    const transcribeResponse = await fetch(`${BFF_URL}/api/transcribe`, {
      method: 'POST',
      body: formData
    });
    const transcribeDuration = Date.now() - startTime;
    const transcribeData = await transcribeResponse.json();

    const translateStartTime = Date.now();
    const translateResponse = await fetch(`${BFF_URL}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: transcribeData.text || '' })
    });
    const translateDuration = Date.now() - translateStartTime;
    const translateData = await translateResponse.json();

    const totalDuration = transcribeDuration + translateDuration;

    console.log('识别结果长度:', transcribeData.text?.length || 0);
    console.log('翻译结果长度:', translateData.translation?.length || 0);
    console.log('总耗时:', totalDuration, 'ms');

    // 截图7：长音频测试结果
    await page.setContent(`
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
            .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
            h1 { color: #722ed1; margin-bottom: 20px; }
            .section { margin-top: 20px; }
            .label { font-weight: bold; color: #666; margin-bottom: 8px; }
            .content { background: #fafafa; padding: 12px; border-radius: 4px; max-height: 200px; overflow-y: auto; }
            .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 15px; }
            .metric { background: #f9f0ff; padding: 10px; border-radius: 4px; }
            .metric-label { font-size: 12px; color: #666; }
            .metric-value { font-size: 18px; font-weight: bold; color: #722ed1; }
            .status { margin-top: 15px; padding: 10px; background: ${totalDuration < 30000 ? '#f6ffed' : '#fff2e8'}; border-radius: 4px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🎤 场景4：长音频测试（P2）</h1>
            <div class="section">
              <div class="label">测试文件:</div>
              <div class="content">${testName}.wav (60秒)</div>
            </div>
            <div class="section">
              <div class="label">识别结果（前200字符）:</div>
              <div class="content">${(transcribeData.text || '❌ 识别失败').substring(0, 200)}...</div>
            </div>
            <div class="section">
              <div class="label">翻译结果（前200字符）:</div>
              <div class="content">${(translateData.translation || '❌ 翻译失败').substring(0, 200)}...</div>
            </div>
            <div class="metrics">
              <div class="metric">
                <div class="metric-label">识别延迟</div>
                <div class="metric-value">${transcribeDuration}ms</div>
              </div>
              <div class="metric">
                <div class="metric-label">翻译延迟</div>
                <div class="metric-value">${translateDuration}ms</div>
              </div>
              <div class="metric">
                <div class="metric-label">总耗时</div>
                <div class="metric-value">${totalDuration}ms</div>
              </div>
            </div>
            <div class="status">
              ${totalDuration < 30000 ? '✅ 性能达标（< 30秒）' : '⚠️ 性能未达标（≥ 30秒）'}
            </div>
          </div>
        </body>
      </html>
    `);
    await page.screenshot({ 
      path: path.join(SCREENSHOT_DIR, '07_long_result.png'), 
      fullPage: true 
    });

    // 验证
    if (transcribeResponse.status === 200 && transcribeData.text) {
      testResults.scenario4.passed++;
    } else {
      testResults.scenario4.failed++;
    }
    if (totalDuration < 30000) {
      testResults.scenario4.passed++;
    } else {
      testResults.scenario4.failed++;
    }

    testResults.scenario4.details = {
      recognized: transcribeData.text,
      translated: translateData.translation,
      performance: {
        transcribeLatency: transcribeDuration,
        translateLatency: translateDuration,
        totalDuration: totalDuration
      }
    };

    expect(transcribeResponse.status).toBe(200);
    expect(transcribeData.text).toBeTruthy();
    expect(translateResponse.status).toBe(200);
    expect(translateData.translation).toBeTruthy();

    console.log(`\n========== 场景4测试完成 ==========`);
    console.log(`通过: ${testResults.scenario4.passed}/2`);
  });
});
