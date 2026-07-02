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

test('login page loads and admin can sign in to dashboard', async ({ page }) => {
  await page.goto('/login');
  await page.waitForURL('**/login');

  await expect(page.getByRole('heading', { name: /login/i })).toBeVisible();

  await page.fill('#login-id', adminLoginId);
  await page.fill('#login-password', adminPassword);
  await page.click('button[type="submit"]');

  await page.waitForURL('**/');
  await expect(page).not.toHaveURL(/login/);
});
