import { expect, test } from '@playwright/test'

test('keeps the mail surface themed and shows mailbox skeletons until the API responds', async ({ page, context, baseURL }) => {
    test.skip(!/localhost|127\.0\.0\.1/.test(baseURL || ''), 'Uses loopback-only render-proof auth')
    await context.setExtraHTTPHeaders({ 'x-hanasand-render-proof-auth': 'local-dashboard-render-proof' })
    await context.addCookies([
        { name: 'id', value: 'dashboard-render-proof-user', url: baseURL! },
        { name: 'access_token', value: 'local-dashboard-render-proof-token', url: baseURL! },
    ])

    let finishOverview: (() => Promise<void>) | undefined
    await page.route('**/api/mail/overview**', route => new Promise<void>(resolve => {
        finishOverview = async () => {
            await route.fulfill({ json: {
                actor: { id: 'dashboard-render-proof-user' }, mailboxUser: 'dashboard-render-proof-user', mailboxAddress: 'test@example.com',
                accessibleAccounts: [], mailboxes: [{ id: 'inbox', name: 'Inbox', role: 'inbox' }], selectedMailboxId: 'inbox',
                messages: [{ id: 'ready', subject: 'API result', from: [{ email: 'sender@example.com' }], to: [], cc: [], receivedAt: '2026-10-20T10:00:00Z', mailboxIds: ['inbox'], preview: 'Ready', isRead: true }],
                nextCursor: null, selectedMessage: null,
            } })
            resolve()
        }
    }))

    await page.goto('/')
    await expect(page.getByRole('status', { name: 'Loading messages' })).toBeVisible()
    await expect(page.getByRole('status', { name: 'Loading mailboxes' })).toBeVisible()
    await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(7, 7, 7)')

    await expect.poll(() => Boolean(finishOverview)).toBe(true)
    await finishOverview?.()
    await expect(page.getByTestId('mail-message-ready')).toBeVisible()
    await expect(page.getByRole('status', { name: 'Loading messages' })).toHaveCount(0)
})

test('shows a useful reconnect message for a closed mail-server connection', async ({ page, context, baseURL }) => {
    test.skip(!/localhost|127\.0\.0\.1/.test(baseURL || ''), 'Uses loopback-only render-proof auth')
    await context.setExtraHTTPHeaders({ 'x-hanasand-render-proof-auth': 'local-dashboard-render-proof' })
    await context.addCookies([
        { name: 'id', value: 'dashboard-render-proof-user', url: baseURL! },
        { name: 'access_token', value: 'local-dashboard-render-proof-token', url: baseURL! },
    ])
    await page.route('**/api/mail/overview**', route => route.fulfill({
        status: 500,
        json: { error: 'The socket connection was closed unexpectedly. For more information, pass `verbose: true` in the second argument to fetch()' },
    }))

    await page.goto('/')
    await expect(page.getByText('Mail reconnecting', { exact: true })).toBeVisible()
    await expect(page.getByText('The mail service closed the connection before the mailbox loaded. Mail will retry automatically.')).toBeVisible()
    await expect(page.getByText(/verbose: true/)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
})
