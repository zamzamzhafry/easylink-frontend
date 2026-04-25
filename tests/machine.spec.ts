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

test('machine page loads for admin', async ({ page }) => {
  await loginAsAdmin(page);

  await page.goto('/machine');
  await page.waitForURL('**/machine');

  await expect(page.getByText(/machine/i)).toBeVisible();
});

test('non-admin is redirected away from machine page', async ({ page }) => {
  await page.goto('/machine');
  await page.waitForURL('**/login');
  await expect(page).toHaveURL(/login/);
});
