const { chromium } = require('playwright');

async function loginToTikTok() {
  console.log('Launching browser with longer timeouts...');
  const browser = await chromium.launchPersistentContext('/tmp/tiktok-login-session', {
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    viewport: { width: 1280, height: 900 }
  });

  const page = browser.pages()[0] || await browser.newPage();
  
  // Try direct login URL
  console.log('Navigating to TikTok direct login...');
  await page.goto('https://www.tiktok.com/login/phone-email-password', { 
    waitUntil: 'networkidle',
    timeout: 60000 
  });
  
  console.log('Waiting 20 seconds for React hydration...');
  await page.waitForTimeout(20000);
  
  await page.screenshot({ path: '/tmp/tiktok-1-direct-login.png', fullPage: true });
  console.log('Screenshot: /tmp/tiktok-1-direct-login.png');
  
  // Debug: Get all elements
  const debug = await page.evaluate(() => {
    const all = [];
    document.querySelectorAll('input, button, [role="button"]').forEach(el => {
      all.push({
        tag: el.tagName,
        type: el.type || el.getAttribute('type'),
        text: el.textContent?.substring(0, 50),
        placeholder: el.placeholder,
        name: el.name,
        visible: el.offsetParent !== null
      });
    });
    return all;
  });
  
  console.log('Interactive elements found:');
  debug.forEach((el, i) => console.log(`${i}: ${el.tag} type=${el.type} text="${el.text}" placeholder=${el.placeholder} visible=${el.visible}`));
  
  // Try to find and fill form
  const fillSuccess = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    
    // Log all inputs
    console.log('Found inputs:', inputs.length);
    inputs.forEach(inp => {
      console.log('Input:', inp.type, inp.name, inp.placeholder, inp.id);
    });
    
    // Find email and password
    let found = { email: null, password: null };
    
    for (const inp of inputs) {
      const isEmail = inp.type === 'email' || 
                     inp.placeholder?.toLowerCase().includes('email') ||
                     inp.name?.toLowerCase().includes('email');
                     
      const isPassword = inp.type === 'password';
      
      if (isEmail && !found.email) found.email = inp;
      if (isPassword && !found.password) found.password = inp;
    }
    
    if (found.email && found.password) {
      // Focus and type email
      found.email.focus();
      found.email.select();
      document.execCommand('insertText', false, 'sarawankhmer@gmail.com');
      
      // Focus and type password
      found.password.focus();
      found.password.select();
      document.execCommand('insertText', false, 'sarawankh123');
      
      return { filled: true, emailPlaceholder: found.email.placeholder };
    }
    
    return { filled: false, inputCount: inputs.length };
  });
  
  console.log('Fill result:', fillSuccess);
  
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/tiktok-2-filled.png', fullPage: true });
  console.log('Screenshot: /tmp/tiktok-2-filled.png');
  
  if (fillSuccess.filled) {
    // Find and click login button
    const clicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]'));
      const loginBtn = buttons.find(b => {
        const text = b.textContent?.toLowerCase() || '';
        const type = b.type || '';
        return text.includes('log in') || text.includes('login') || type === 'submit';
      });
      
      if (loginBtn) {
        loginBtn.click();
        return { clicked: true, text: loginBtn.textContent };
      }
      return { clicked: false };
    });
    
    console.log('Button click result:', clicked);
    
    await page.waitForTimeout(5000);
    await page.screenshot({ path: '/tmp/tiktok-3-after-click.png', fullPage: true });
    console.log('Screenshot: /tmp/tiktok-3-after-click.png');
    
    const url = page.url();
    console.log('Current URL:', url);
    
    const pageText = await page.evaluate(() => document.body.textContent);
    if (pageText?.includes('verification') || pageText?.includes('code') || pageText?.includes('digit')) {
      console.log('\n========================================');
      console.log('📱 VERIFICATION CODE REQUIRED!');
      console.log('========================================');
      console.log('Check email: sarawankhmer@gmail.com');
      console.log('@Tellsela - waiting 180 seconds for code...');
      console.log('========================================\n');
      await page.waitForTimeout(180000);
    }
    
    await page.screenshot({ path: '/tmp/tiktok-4-final.png', fullPage: true });
    console.log('Final screenshot: /tmp/tiktok-4-final.png');
    
    if (url.includes('foryou') || url.includes('following') || !url.includes('login')) {
      console.log('✅ LOGIN SUCCESSFUL!');
    }
  }
  
  console.log('\nBrowser staying open for 60 seconds...');
  await page.waitForTimeout(60000);
  await browser.close();
}

loginToTikTok().catch(console.error);
