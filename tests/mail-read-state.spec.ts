import { expect, test } from '@playwright/test'

test('opening persists read state and old archived mail never shows unread dots', async ({ page, context, baseURL }) => {
    test.skip(!/localhost|127\.0\.0\.1/.test(baseURL || ''), 'Loopback render proof only')
    await context.setExtraHTTPHeaders({ 'x-hanasand-render-proof-auth': 'local-dashboard-render-proof' })
    await context.addCookies([
        { name: 'id', value: 'dashboard-render-proof-user', url: baseURL! },
        { name: 'access_token', value: 'local-dashboard-render-proof-token', url: baseURL! },
    ])
    let read = false
    let reads = 0
    await page.route('**/api/mail/overview**', route => {
        const query = new URL(route.request().url()).searchParams
        const mailbox = query.get('mailboxId') || 'inbox'
        const message = { id: 'message', subject: 'Example', from: [{ email: 'sender@example.com' }], to: [], cc: [], attachments: [], textBody: 'Hello', mailboxIds: [mailbox], receivedAt: '2026-09-19T10:00:00Z', isRead: mailbox === 'archive' ? false : read }
        return route.fulfill({ json: {
            actor: { id: 'dashboard-render-proof-user' }, mailboxUser: 'dashboard-render-proof-user', mailboxAddress: 'test@example.com', accessibleAccounts: [],
            mailboxes: [{ id: 'inbox', name: 'Inbox', role: 'inbox' }, { id: 'archive', name: 'Archive' }], selectedMailboxId: mailbox,
            messages: [message], selectedMessage: query.get('messageId') ? message : null, nextCursor: null,
        } })
    })
    await page.route('**/api/mail/message/message/action', route => {
        expect(route.request().postDataJSON()).toEqual({ mailboxUser: 'dashboard-render-proof-user', action: 'read' })
        read = true
        reads++
        return route.fulfill({ json: { ok: true } })
    })
    await page.goto('/')
    await expect(page.getByLabel('Unread message', { exact: true })).toHaveCount(1)
    expect(reads).toBe(0)
    await page.getByTestId('mail-message-message').click()
    await expect(page.getByText('Hello', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Back to Inbox', exact: true }).click()
    await expect(page.getByLabel('Unread message', { exact: true })).toHaveCount(0)
    await page.reload()
    await expect(page.getByTestId('mail-message-message')).toBeVisible()
    await expect(page.getByLabel('Unread message', { exact: true })).toHaveCount(0)
    expect(reads).toBe(1)
    await page.getByRole('button', { name: /^Archive/ }).click()
    await expect(page.getByTestId('mail-message-message')).toBeVisible()
    await expect(page.getByLabel('Unread message', { exact: true })).toHaveCount(0)
})
