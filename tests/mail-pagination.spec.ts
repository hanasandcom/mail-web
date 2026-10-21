import { expect, test } from '@playwright/test'

test('mail scroll loads older messages, retries failures and contains long mailbox names', async ({ page, context, baseURL }) => {
    test.skip(!/localhost|127\.0\.0\.1/.test(baseURL || ''), 'Uses loopback-only render proof auth')
    await context.setExtraHTTPHeaders({ 'x-hanasand-render-proof-auth': 'local-dashboard-render-proof' })
    await context.addCookies([
        { name: 'id', value: 'dashboard-render-proof-user', url: baseURL! },
        { name: 'access_token', value: 'local-dashboard-render-proof-token', url: baseURL! },
    ])
    let failNext = true
    let archived = false
    await page.route('**/api/mail/overview**', async route => {
        const params = new URL(route.request().url()).searchParams
        const after = params.get('after')
        const support = params.get('mailboxUser') === 'shared:support'
        if (after && failNext) { failNext = false; return route.fulfill({ status: 503, json: { error: 'Temporary outage' } }) }
        const messages = Array.from({ length: support ? (archived ? 5 : 6) : after ? 25 : 50 }, (_, i) => ({ id: support ? `support-${i + (archived ? 1 : 0)}` : String(i + (after ? 50 : 0)), subject: `Message ${i + (after ? 50 : 0)}`, from: [{ email: 'sender@example.com' }], to: [{ email: 'support@example.com' }], cc: [{ email: 'other@example.com' }], receivedAt: '2026-09-19T10:00:00Z', mailboxIds: ['inbox'], preview: 'preview', isRead: false }))
        await route.fulfill({ json: {
            actor: { id: 'dashboard-render-proof-user', canAccessAnyMailbox: true }, mailboxUser: support ? 'shared:support' : 'dashboard-render-proof-user', mailboxAddress: support ? 'support@example.com' : 'test@example.com',
            accessibleAccounts: [{ id: 'shared:security', name: 'Security', address: 'security@example.com', shared: true }, { id: 'shared:support', name: 'Support', address: 'support@example.com', shared: true }, { id: 'dashboard-render-proof-user', name: 'Test', address: 'test@example.com' }, { id: 'long', name: 'VeryLongMailboxName'.repeat(20), address: 'long@example.com' }],
            mailboxes: [{ id: 'inbox', name: 'Inbox', role: 'inbox', totalEmails: 75 }], selectedMailboxId: 'inbox', messages, nextCursor: support || after ? null : '49',
            selectedMessage: params.get('messageId') ? { ...messages.find(message => message.id === params.get('messageId')), replyTo: [], bcc: [], attachments: [], textBody: 'Original message', htmlBody: '<p>Original message</p>' } : null,
        } })
    })
    await page.goto('/')
    await expect(page.getByTestId('mail-message-49')).toBeAttached()
    await expect(page.getByRole('button', { name: 'Open Security', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Load older messages' }).scrollIntoViewIfNeeded()
    await expect(page.getByRole('alert').filter({ hasText: 'Could not load older messages' })).toBeVisible()
    await page.getByRole('button', { name: 'Load older messages' }).click()
    await expect(page.getByTestId('mail-message-74')).toBeAttached()
    await expect(page.locator('button[data-testid^="mail-message-"]')).toHaveCount(75)
    await expect(page.getByRole('button', { name: 'Load older messages' })).toHaveCount(0)
    for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 })
        await expect(page.getByLabel('Other mailboxes', { exact: true })).toHaveCount(0)
        const mailbox = page.getByRole('button', { name: /^Open VeryLongMailboxName/ })
        expect(await mailbox.evaluate(el => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().right <= el.closest('aside')!.getBoundingClientRect().right)).toBe(true)
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.getByRole('button', { name: 'Open Support', exact: true }).click()
    await expect(page.locator('button[data-testid^="mail-message-"]')).toHaveCount(6)
    await expect(page.getByTestId('mail-message-0')).toHaveCount(0)
    await page.waitForTimeout(11_000)
    await expect(page.locator('button[data-testid^="mail-message-"]')).toHaveCount(6)
    const row = page.getByTestId('mail-message-support-0')
    await row.click({ button: 'right' })
    await expect(page.getByRole('menu', { name: 'Message actions' })).toBeVisible()
    await page.getByRole('menuitem', { name: 'Reply all', exact: true }).click()
    await expect(page.getByTestId('mail-compose-to')).toHaveValue('sender@example.com, other@example.com')
    await expect(page.getByTestId('mail-compose-form')).toContainText('Create message')
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    let actedOn: unknown
    await page.route('**/api/mail/message/*/action', async route => {
        actedOn = { url: route.request().url(), ...route.request().postDataJSON() }
        archived = true
        await route.fulfill({ json: { ok: true } })
    })
    await row.focus()
    await page.keyboard.press('Shift+F10')
    await page.getByRole('menuitem', { name: 'Archive', exact: true }).click()
    await expect.poll(() => actedOn).toMatchObject({ action: 'archive', mailboxUser: 'shared:support' })
    expect((actedOn as { url: string }).url).toContain('/message/support-0/action')
    await expect(row).toHaveCount(0)
    await expect(page.locator('button[data-testid^="mail-message-"]')).toHaveCount(5)
    await page.getByTestId('mail-message-support-1').click()
    const frame = page.frameLocator('iframe[title="HTML mail"]')
    for (const theme of ['dark', 'light']) {
        await page.evaluate(value => {
            document.documentElement.classList.remove('dark', 'light')
            document.documentElement.classList.add(value)
        }, theme)
        await expect(page.locator('iframe[title="HTML mail"]')).toHaveCSS('color-scheme', theme)
        await expect(frame.locator('html')).toHaveCSS('color-scheme', theme)
        await expect(frame.locator('html')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
        await expect(frame.locator('body')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
        await expect(frame.getByText('Original message')).toBeVisible()
    }
})
