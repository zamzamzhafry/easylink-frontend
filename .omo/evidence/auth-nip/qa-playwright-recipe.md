# QA Playwright Login Recipe — EasyLink Auth NIP

## Context

Used for browser-based end-to-end verification of the login flow.
Applies to: NIP lane (employee001, leader001, admin001) and account lane (admin01).

---

## Critical: `.click()` Is Dead in MCP Browser

> **TRUSTED `.click()` DOES NOT WORK in the Playwright MCP browser.**
> Do NOT use `locator.click()` or `element.click()` to submit the login form.
> Use `page.evaluate(() => form.requestSubmit())` instead (see below).

---

## Login Recipe

### 1. Clear cookies between accounts

```js
await context.clearCookies();
// or per-page:
await page.context().clearCookies();
```

Always clear between accounts to avoid stale session bleed.

### 2. Navigate to login page

```js
await page.goto('http://localhost:3000/login');
// or root if it redirects:
await page.goto('http://localhost:3000');
```

### 3. Fill credentials

Selectors:
- Login ID field: `#login-id`
- Password field: `#login-password`

```js
await page.fill('#login-id', 'employee001');
await page.fill('#login-password', 'password');
```

### 4. Submit form via requestSubmit (NOT click)

```js
const formHandle = await page.$('form');
await page.evaluate(f => f.requestSubmit(), formHandle);
```

Do **not** use:
```js
// BROKEN in MCP browser:
await page.click('button[type=submit]');
await formHandle.click();
```

### 5. Wait for navigation / response

```js
await page.waitForNavigation({ waitUntil: 'networkidle' });
// or wait for a post-login element:
await page.waitForSelector('[data-testid="dashboard"]');
```

---

## Seed Accounts

| Login ID    | Password   | Lane        | karyawan_id | subject_type    |
|-------------|------------|-------------|-------------|-----------------|
| employee001 | password   | NIP         | 10008       | employee_nip    |
| leader001   | password   | NIP         | 10007       | employee_nip    |
| admin001    | password   | NIP         | 10006       | employee_nip    |
| admin01     | Admin@123  | account     | —           | (account)       |

---

## Notes

- Single `<form>` on the login page — no need to scope the selector further.
- Cookie jar for curl tests: `/tmp/qa-harness-<login_id>.cookie`
- For multi-account test runs, always clear cookies first or use isolated browser contexts.
