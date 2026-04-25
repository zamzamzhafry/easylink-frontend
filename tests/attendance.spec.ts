import { expect, test, type Page } from '@playwright/test';

const adminLoginId =
  process.env.PLAYWRIGHT_ADMIN_LOGIN ?? process.env.ADMIN_LOGIN_ID ?? 'admin001';
const adminPassword =
  process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? 'password123';

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.waitForURL('**/login');

  await page.fill('label:has-text("Login ID") >> input', adminLoginId);
  await page.fill('label:has-text("Password") >> input', adminPassword);
  await page.click('button[type="submit"]');

  await page.waitForURL('**/');
}

test('attendance page loads for admin and shows table', async ({ page }) => {
  await loginAsAdmin(page);

  await page.goto('/attendance');
  await page.waitForURL('**/attendance');

  await expect(page.getByRole('table')).toBeVisible();
});
