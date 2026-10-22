import { expect, test } from '@playwright/test'

test('standalone Mail renders its sign-in fields without a remote form script', async ({ page, baseURL }) => {
    test.skip(!/localhost|127\.0\.0\.1/.test(baseURL || ''), 'Uses the isolated local Mail UI')

    await page.goto('/')

    await expect(page.getByLabel('Email or username')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeDisabled()
    await expect(page.locator('script[src*="login-form.js"]')).toHaveCount(0)
})
