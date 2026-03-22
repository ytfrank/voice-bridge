const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // 访问应用
    console.log('访问 http://localhost:8081...');
    await page.goto('http://localhost:8081');
    await page.waitForTimeout(3000);
    
    // 截图1: 初始页面
    await page.screenshot({ path: 'tests/screenshots/web_e2e/05_initial_page.png', fullPage: true });
    console.log('截图1: 初始页面');
    
    // 检查页面内容
    const content = await page.content();
    console.log('页面标题:', await page.title());
    
    // 检查是否有"开始"按钮
    const startButton = await page.locator('button:has-text("开始")').count();
    console.log('找到"开始"按钮数量:', startButton);
    
    if (startButton > 0) {
      // 截图2: 按钮点击前
      await page.screenshot({ path: 'tests/screenshots/web_e2e/06_before_click.png', fullPage: true });
      console.log('截图2: 按钮点击前');
      
      // 点击开始按钮
      await page.locator('button:has-text("开始")').first().click();
      await page.waitForTimeout(2000);
      
      // 截图3: 按钮点击后
      await page.screenshot({ path: 'tests/screenshots/web_e2e/07_after_click.png', fullPage: true });
      console.log('截图3: 按钮点击后');
      
      // 检查状态文本
      const statusText = await page.locator('text=/正在聆听/').count();
      console.log('找到"正在聆听"文本数量:', statusText);
      
      // 等待5秒看看是否有结果
      await page.waitForTimeout(5000);
      
      // 截图4: 等待后
      await page.screenshot({ path: 'tests/screenshots/web_e2e/08_after_wait.png', fullPage: true });
      console.log('截图4: 等待后');
    }
    
    // 检查控制台错误
    page.on('console', msg => {
      console.log('浏览器控制台:', msg.text());
    });
    
    // 最终截图
    await page.screenshot({ path: 'tests/screenshots/web_e2e/09_final_state.png', fullPage: true });
    console.log('截图5: 最终状态');
    
    console.log('\\n测试完成!');
    
  } catch (error) {
    console.error('测试错误:', error);
    await page.screenshot({ path: 'tests/screenshots/web_e2e/99_error.png', fullPage: true });
  } finally {
    await browser.close();
  }
})();
