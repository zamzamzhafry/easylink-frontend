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

test('machine page loads for admin', async ({ page }) => {
  await loginAsAdmin(page);

  await page.goto('/machine');
  await page.waitForURL('**/machine');

  // Scope to a single unique element — bare /machine/i matches 7 nodes
  // (strict-mode violation). The Machine Queue panel is admin-only + unique.
  await expect(page.getByText('Machine Queue', { exact: true })).toBeVisible();
});

test('non-admin is redirected away from machine page', async ({ page }) => {
  await page.goto('/machine');
  // app-shell redirects to /login?next=<path>; glob must allow the query.
  await page.waitForURL('**/login*');
  await expect(page).toHaveURL(/login/);
});
