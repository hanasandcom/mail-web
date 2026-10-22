import { expect, test } from '@playwright/test'

test('Mail sign-in renders the locally bundled Identity controls', async ({ page }) => {
    const remoteLoginScripts: string[] = []
    page.on('request', request => {
        if (request.url().includes('/api/auth/login-form.js')) remoteLoginScripts.push(request.url())
    })

    await page.goto('/?returnTo=%2Finbox')

    await expect(page.getByRole('textbox', { name: 'Email or username' })).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in with passkey' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Continue with Google' }))
        .toHaveAttribute('href', '/api/auth/sso/start?returnTo=%2Finbox')
    expect(remoteLoginScripts).toEqual([])
})

test('password sign-in keeps Mail’s session cookie adapter', async ({ page, context }) => {
    await page.route('**/api/auth/login', route => route.fulfill({ json: {
        id: 'mail-user', name: 'Mail User', avatar: '', token: 'mail-session-token',
        expires_at: new Date(Date.now() + 60_000).toISOString(),
    } }))

    await page.goto('/')
    await page.getByRole('textbox', { name: 'Email or username' }).fill('mail-user')
    await page.getByLabel('Password').fill('correct horse battery staple')
    const loginRequest = page.waitForRequest(request => request.url().endsWith('/api/auth/login'))
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()

    expect((await loginRequest).postDataJSON()).toEqual({ username: 'mail-user', password: 'correct horse battery staple' })
    await expect(page).toHaveURL(/\/$/)
    const cookies = await context.cookies()
    expect(cookies.find(cookie => cookie.name === 'access_token')?.value).toBe('mail-session-token')
    expect(cookies.find(cookie => cookie.name === 'id')?.value).toBe('mail-user')
})

test('passkey sessions are accepted by Mail’s existing session adapter', async ({ page, context }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Sign in with passkey' }).waitFor()
    await page.locator('hanasand-login-form').evaluate(element => {
        element.dispatchEvent(new CustomEvent('hanasand-authenticated', {
            bubbles: true,
            cancelable: true,
            detail: {
                id: 'passkey-user', name: 'Passkey User', avatar: '', token: 'passkey-session-token',
                expires_at: new Date(Date.now() + 60_000).toISOString(),
            },
        }))
    })

    await expect(page).toHaveURL(/\/$/)
    const cookies = await context.cookies()
    expect(cookies.find(cookie => cookie.name === 'access_token')?.value).toBe('passkey-session-token')
    expect(cookies.find(cookie => cookie.name === 'id')?.value).toBe('passkey-user')
})
