import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:8080';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const response = await page.goto(baseURL, { waitUntil: 'networkidle', timeout: 30000 });
  assert.ok(response && response.ok(), `Homepage returned ${response?.status()}`);
  assert.match(await page.title(), /Sanyog/i, 'Expected the platform title');
  await page.getByRole('link', { name: /login/i }).first().waitFor({ state: 'visible', timeout: 10000 });
  await page.getByRole('link', { name: /opportunities/i }).first().waitFor({ state: 'visible', timeout: 10000 });
  await page.getByRole('link', { name: /opportunities/i }).first().click();
  await page.waitForURL('**/opportunities', { timeout: 10000 });
  assert.deepEqual(pageErrors, [], `Browser runtime errors: ${pageErrors.join('; ')}`);
  console.log('Browser smoke test passed: homepage, navigation and no uncaught page errors.');
} finally {
  await browser.close();
}
