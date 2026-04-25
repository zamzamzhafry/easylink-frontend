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

test('login page loads and admin can sign in to dashboard', async ({ page }) => {
  await page.goto('/login');
  await page.waitForURL('**/login');

  await expect(page.getByRole('heading', { name: /login/i })).toBeVisible();

  await page.fill('label:has-text("Login ID") >> input', adminLoginId);
  await page.fill('label:has-text("Password") >> input', adminPassword);
  await page.click('button[type="submit"]');

  await page.waitForURL('**/');
  await expect(page).not.toHaveURL(/login/);
});
