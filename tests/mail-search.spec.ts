import { expect, test } from '@playwright/test'

test('mailbox search calls the API and refreshes results after an archive action', async ({ page, context, baseURL }) => {
    test.skip(!/localhost|127\.0\.0\.1/.test(baseURL || ''), 'Uses loopback-only render proof auth')
    await context.setExtraHTTPHeaders({ 'x-hanasand-render-proof-auth': 'local-dashboard-render-proof' })
    await context.addCookies([
        { name: 'id', value: 'dashboard-render-proof-user', url: baseURL! },
        { name: 'access_token', value: 'local-dashboard-render-proof-token', url: baseURL! },
    ])
    let archived = false
    const messages = () => archived ? [] : [{
        id: 'search-match', subject: 'Invoice from Acme', preview: 'March invoice', receivedAt: '2026-10-20T10:00:00Z',
        from: [{ email: 'billing@acme.example' }], to: [{ email: 'user@example.test' }], cc: [], mailboxIds: ['inbox'],
        hasAttachment: false, isRead: false, isFlagged: false, isAnswered: false, isDraft: false, isJunk: false, isDeleted: false,
    }]
    await page.route('**/api/backend/mail/overview**', async route => {
        const params = new URL(route.request().url()).searchParams
        const result = messages()
        await route.fulfill({ json: {
            actor: { id: 'dashboard-render-proof-user', canAccessAnyMailbox: false, canSend: true },
            mailboxUser: 'dashboard-render-proof-user', mailboxAddress: 'user@example.test',
            accessibleAccounts: [{ id: 'dashboard-render-proof-user', name: 'Test', address: 'user@example.test', shared: false }],
            mailboxes: [{ id: 'inbox', name: 'Inbox', role: 'inbox', totalEmails: result.length }],
            selectedMailboxId: 'inbox', messages: result, nextCursor: null,
            selectedMessage: params.get('messageId') ? {
                ...result.find(message => message.id === params.get('messageId')),
                replyTo: [], bcc: [], attachments: [], textBody: 'Invoice details', htmlBody: '<p>Invoice details</p>',
            } : null,
            filters: [], recentRecipients: [],
        } })
    })
    const searchQueries: string[] = []
    await page.route('**/api/backend/mail/search**', async route => {
        const url = new URL(route.request().url())
        searchQueries.push(url.searchParams.get('query') || '')
        await route.fulfill({ json: { messages: messages(), nextCursor: null } })
    })
    await page.route('**/api/backend/mail/message/*/action', async route => {
        archived = true
        await route.fulfill({ json: { ok: true } })
    })

    await page.goto('/')
    await page.getByRole('button', { name: /Search this mailbox/ }).click()
    await page.getByRole('textbox', { name: 'Search this mailbox' }).fill('invoice & tax')
    const row = page.getByTestId('mail-message-search-match')
    await expect(row).toBeVisible()
    expect(searchQueries).toContain('invoice & tax')
    await row.click()
    await page.getByRole('button', { name: 'Archive', exact: true }).click()
    await expect(row).toHaveCount(0)
    expect(searchQueries.filter(query => query === 'invoice & tax').length).toBeGreaterThanOrEqual(2)
})
