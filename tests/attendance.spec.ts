import { expect, test, type Page } from '@playwright/test';

const adminLoginId =
  process.env.PLAYWRIGHT_ADMIN_LOGIN ?? process.env.ADMIN_LOGIN_ID ?? 'admin001';
const adminPassword =
  process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? 'password';

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.waitForURL('**/login');

  await page.fill('#login-id', adminLoginId);
  await page.fill('#login-password', adminPassword);
  await page.click('button[type="submit"]');

  await page.waitForURL('**/');
}

test('attendance page loads for admin and shows table', async ({ page }) => {
  await loginAsAdmin(page);

  // waitUntil domcontentloaded — the page opens a scanlog stream/long-poll
  // that prevents the default 'load' from ever settling. Skip waitForURL:
  // the post-login cookie can race the client auth-gate and briefly bounce
  // to /login?next=, so the URL glob is unreliable. Assert the table directly
  // (retries until visible or test timeout).
  await page.goto('/attendance', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('table')).toBeVisible();
});
