import { expect, test } from '@playwright/test'

test('uses same-origin HttpOnly session cookies when JavaScript cannot read the token', async ({ page, context, baseURL }) => {
    test.skip(!/localhost|127\.0\.0\.1/.test(baseURL || ''), 'Uses loopback-only render-proof auth')
    await context.setExtraHTTPHeaders({ 'x-hanasand-render-proof-auth': 'local-dashboard-render-proof' })
    await context.addCookies([
        { name: 'id', value: 'dashboard-render-proof-user', url: baseURL! },
        { name: 'access_token', value: 'local-dashboard-render-proof-token', url: baseURL!, httpOnly: true },
    ])

    let requestHeaders: Record<string, string> | undefined
    await page.route('**/api/mail/overview**', async route => {
        requestHeaders = await route.request().allHeaders()
        await route.fulfill({ json: {
            actor: { id: 'dashboard-render-proof-user' }, mailboxUser: 'dashboard-render-proof-user', mailboxAddress: 'test@example.com',
            accessibleAccounts: [], mailboxes: [{ id: 'inbox', name: 'Inbox', role: 'inbox' }], selectedMailboxId: 'inbox',
            messages: [], nextCursor: null, selectedMessage: null,
        } })
    })

    await page.goto('/')
    await expect(page.getByText('Inbox', { exact: true })).toBeVisible()
    expect(requestHeaders?.cookie).toContain('access_token=local-dashboard-render-proof-token')
    expect(requestHeaders?.authorization).toBeUndefined()
})
