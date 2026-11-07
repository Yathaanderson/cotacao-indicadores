import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('https://app.powercrm.com.br/', { waitUntil: 'networkidle', timeout: 45000 }).catch(e => console.log('goto:', e.message));
await page.waitForTimeout(4000);
await page.screenshot({ path: '/tmp/login.png', fullPage: false });
const inputs = await page.$$eval('input', els => els.map(e => ({
  type: e.type, name: e.name, id: e.id, placeholder: e.placeholder,
  ariaLabel: e.getAttribute('aria-label'), formControlName: e.getAttribute('formcontrolname'),
  visible: !!(e.offsetWidth || e.offsetHeight)
})));
console.log('INPUTS:', JSON.stringify(inputs, null, 1));
const buttons = await page.$$eval('button', els => els.map(e => (e.innerText || e.getAttribute('aria-label') || '').trim()).filter(Boolean));
console.log('BUTTONS:', JSON.stringify(buttons.slice(0, 15)));
const labels = await page.$$eval('label', els => els.map(e => (e.innerText || '').trim()).filter(Boolean));
console.log('LABELS:', JSON.stringify(labels.slice(0, 15)));
console.log('FRAMES:', page.frames().length);
console.log('BODY_TEXT:', (await page.innerText('body')).slice(0, 400).replace(/\n+/g, ' | '));
await browser.close();
