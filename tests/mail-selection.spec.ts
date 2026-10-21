import { expect, test } from '@playwright/test'

test('select mail without opening it, archive a group, and retain failures for retry', async ({ page, context, baseURL }) => {
    test.skip(!/localhost|127\.0\.0\.1/.test(baseURL || ''), 'Uses loopback-only render-proof auth')
    await context.setExtraHTTPHeaders({ 'x-hanasand-render-proof-auth': 'local-dashboard-render-proof' })
    await context.addCookies([
        { name: 'id', value: 'dashboard-render-proof-user', url: baseURL! },
        { name: 'access_token', value: 'local-dashboard-render-proof-token', url: baseURL! },
    ])
    const messages = ['One', 'Two', 'Three'].map(id => ({ id, subject: id, from: [{ email: 'sender@example.com' }], receivedAt: '2026-09-19T10:00:00Z', preview: 'Preview', isRead: false, mailboxIds: ['inbox'] }))
    const archived = new Set<string>()
    let fail = true
    const requests: { id: string, mailboxUser: string, action: string }[] = []
    await page.route('**/api/mail/overview**', route => {
        const mailbox = new URL(route.request().url()).searchParams.get('mailboxId') || 'inbox'
        return route.fulfill({ json: {
            actor: { id: 'dashboard-render-proof-user', canSend: true }, mailboxUser: 'dashboard-render-proof-user', mailboxAddress: 'test@example.com', accessibleAccounts: [],
            mailboxes: [{ id: 'inbox', name: 'Inbox', role: 'inbox' }, { id: 'archive', name: 'Archived', role: 'archive' }], selectedMailboxId: mailbox,
            messages: messages.filter(message => mailbox === 'archive' ? archived.has(message.id) : !archived.has(message.id)), nextCursor: null, selectedMessage: null,
        } })
    })
    await page.route('**/api/mail/message/*/action', route => {
        const id = new URL(route.request().url()).pathname.split('/').at(-2)!
        requests.push({ id, ...route.request().postDataJSON() })
        if (id === 'Two' && fail) return route.fulfill({ status: 503, json: { error: 'Temporarily unavailable' } })
        archived.add(id)
        return route.fulfill({ json: { ok: true } })
    })
    await page.goto('/')
    await expect(page.getByTestId('mail-message-One')).toBeVisible()
    await expect(page.getByRole('checkbox')).toHaveCount(0)
    await page.locator('[data-mail-filter-strip]').getByRole('button', { name: 'Select', exact: true }).click()
    await expect(page.locator('input[type=checkbox]:checked')).toHaveCount(0)
    await page.getByRole('button', { name: 'Select all', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('3 selected')
    await page.getByRole('button', { name: 'Unselect all', exact: true }).click()
    await expect(page.getByRole('checkbox')).toHaveCount(3)
    await expect(page.locator('input[type=checkbox]:checked')).toHaveCount(0)
    await page.getByRole('button', { name: 'Select all', exact: true }).click()
    await page.getByRole('checkbox', { name: 'Select Three', exact: true }).uncheck()
    await expect(page.getByRole('button', { name: 'Select all', exact: true })).toBeVisible()
    await page.getByRole('checkbox', { name: 'Select Three', exact: true }).check()
    await expect(page.getByRole('button', { name: 'Unselect all', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Hide', exact: true }).click()
    await expect(page.getByRole('checkbox')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Archive selected', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Select', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Archive selected', exact: true })).toHaveCount(0)
    await page.getByRole('checkbox', { name: 'Select One', exact: true }).check()
    await page.getByRole('checkbox', { name: 'Select Two', exact: true }).check()
    await expect(page.getByRole('button', { name: 'Back to Inbox', exact: true })).toHaveCount(0)
    await expect(page.getByRole('status')).toContainText('2 selected')
    await page.waitForTimeout(11_000)
    await expect(page.getByRole('status')).toContainText('2 selected')
    await page.getByRole('button', { name: 'Archive selected', exact: true }).click()
    await expect(page.getByTestId('mail-message-One')).toHaveCount(0)
    await expect(page.getByRole('checkbox', { name: 'Select Two', exact: true })).toBeChecked()
    await expect(page.getByText('Could not archive 1 selected message. Try again.')).toBeVisible()
    expect(requests).toEqual(['One', 'Two'].map(id => ({ id, action: 'archive', mailboxUser: 'dashboard-render-proof-user' })))
    fail = false
    await page.getByRole('button', { name: 'Archive selected', exact: true }).click()
    await expect(page.getByTestId('mail-message-Two')).toHaveCount(0)
    await page.getByRole('button', { name: 'Hide', exact: true }).click()
    await page.getByRole('button', { name: 'Select', exact: true }).click()
    await page.getByRole('button', { name: 'Select all', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('1 selected')
    await page.getByRole('button', { name: /^Archived/ }).click()
    await expect(page.getByTestId('mail-message-One')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Archive selected', exact: true })).toHaveCount(0)
    await expect(page.getByRole('checkbox')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Select all', exact: true })).toHaveCount(0)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: 'Select', exact: true }).click()
    await page.getByRole('button', { name: 'Select all', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('2 selected')
    const list = page.locator('[data-mail-message-list]')
    expect(await list.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
})
