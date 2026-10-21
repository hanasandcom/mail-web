import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'

test('HTML mail blocks remote images until the user loads images with a cached safe verdict', async ({ page, context, baseURL }) => {
    test.skip(!/localhost|127\.0\.0\.1/.test(baseURL || ''), 'Uses loopback-only render proof auth')
    await context.setExtraHTTPHeaders({ 'x-hanasand-render-proof-auth': 'local-dashboard-render-proof' })
    await context.addCookies([
        { name: 'id', value: 'dashboard-render-proof-user', url: baseURL! },
        { name: 'access_token', value: 'local-dashboard-render-proof-token', url: baseURL! },
    ])

    const safeUrl = 'https://safe-images.example.test/pixel.png?campaign=mail'
    const flaggedUrl = 'https://flagged-images.example.test/pixel.png'
    const unknownUrl = 'https://unknown-images.example.test/pixel.png'
    const idFor = (url: string) => createHash('sha256').update(url).digest('hex')
    const imageRequests: string[] = []
    page.on('request', request => {
        if (request.url().includes('images.example.test')) imageRequests.push(request.url())
    })
    await page.route('**/api/mail/overview**', async route => {
        const params = new URL(route.request().url()).searchParams
        const message = {
            id: 'remote-mail', subject: 'Remote image example', preview: 'Message with images',
            receivedAt: '2026-10-20T10:00:00Z', from: [{ email: 'sender@example.test' }], to: [], cc: [], mailboxIds: ['inbox'],
            hasAttachment: true, isRead: false, isFlagged: false, isAnswered: false, isDraft: false, isJunk: false, isDeleted: false,
        }
        await route.fulfill({ json: {
            actor: { id: 'dashboard-render-proof-user', canAccessAnyMailbox: false, canSend: true },
            mailboxUser: 'dashboard-render-proof-user', mailboxAddress: 'user@example.test',
            accessibleAccounts: [{ id: 'dashboard-render-proof-user', name: 'Test', address: 'user@example.test' }],
            mailboxes: [{ id: 'inbox', name: 'Inbox', role: 'inbox', totalEmails: 1 }],
            selectedMailboxId: 'inbox', messages: [message], nextCursor: null,
            selectedMessage: params.get('messageId') ? {
                ...message, replyTo: [], bcc: [], attachments: [{ blobId: 'file-1', name: 'danger.html', type: 'text/html', size: 2048 }], textBody: 'Example',
                htmlBody: `<p>Message body</p><img alt="safe" src="${safeUrl}" srcset="${unknownUrl} 2x"><img alt="flagged" src="${flaggedUrl}"><img alt="unknown" src="${unknownUrl}"><div style="background-image:url('${flaggedUrl}')">Styled content</div><video poster="https://safe-poster.example.test/poster.png"></video>`,
            } : null,
            filters: [], recentRecipients: [],
        } })
    })
    await page.route('**/api/mail/message/remote-mail/reputation**', async route => {
        expect(route.request().method()).toBe('GET')
        await route.fulfill({ json: {
            messageId: 'remote-mail',
            remoteUrls: [
                { id: idFor(safeUrl), url: safeUrl, reputation: { provider: 'virustotal', status: 'known', flagged: 0, total: 90 } },
                { id: idFor(flaggedUrl), url: flaggedUrl, reputation: { provider: 'virustotal', status: 'known', flagged: 3, total: 90 } },
                { id: idFor(unknownUrl), url: unknownUrl, reputation: { provider: 'virustotal', status: 'unknown' } },
                { id: idFor('https://safe-poster.example.test/poster.png'), url: 'https://safe-poster.example.test/poster.png', reputation: { provider: 'virustotal', status: 'known', flagged: 0, total: 90 } },
            ],
            attachments: [{ blobId: 'file-1', name: 'danger.html', size: 2048, reputation: { provider: 'virustotal', status: 'known', flagged: 4, total: 90 } }],
        } })
    })
    await page.route('https://safe-images.example.test/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p6sAAAAASUVORK5CYII=', 'base64') }))
    await page.route('https://flagged-images.example.test/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: '' }))
    await page.route('https://unknown-images.example.test/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: '' }))

    await page.goto('/')
    await page.getByTestId('mail-message-remote-mail').click()
    const frame = page.frameLocator('iframe[title="HTML mail"]')
    await expect(frame.getByText('Message body')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Load safe remote images' })).toBeVisible()
    await expect(page.getByText('Potential threat: 4 / 90 scanners flagged')).toBeVisible()
    await expect(page.getByText(/may reveal your IP address/)).toBeVisible()
    await page.waitForTimeout(150)
    expect(imageRequests).toEqual([])

    await page.getByRole('button', { name: 'Load safe remote images' }).click()
    await expect.poll(() => imageRequests).toContain(safeUrl)
    expect(imageRequests).toEqual([safeUrl])
    await expect(frame.locator('img[alt="flagged"]')).not.toHaveAttribute('src')
    await expect(frame.locator('img[alt="unknown"]')).not.toHaveAttribute('src')
    await expect(frame.locator('img[alt="safe"]')).not.toHaveAttribute('srcset')
    await expect(frame.locator('div')).not.toHaveAttribute('style', /background-image/)

    await page.getByRole('button', { name: 'Hide remote images' }).click()
    await expect.poll(() => imageRequests).toEqual([safeUrl])
})

test('unknown and unavailable reputation never offers remote-image loading', async ({ page, context, baseURL }) => {
    test.skip(!/localhost|127\.0\.0\.1/.test(baseURL || ''), 'Uses loopback-only render proof auth')
    await context.setExtraHTTPHeaders({ 'x-hanasand-render-proof-auth': 'local-dashboard-render-proof' })
    await context.addCookies([
        { name: 'id', value: 'dashboard-render-proof-user', url: baseURL! },
        { name: 'access_token', value: 'local-dashboard-render-proof-token', url: baseURL! },
    ])
    const idFor = (url: string) => createHash('sha256').update(url).digest('hex')
    await page.route('**/api/mail/overview**', async route => {
        const params = new URL(route.request().url()).searchParams
        const message = { id: 'unknown-mail', subject: 'Unknown remote image', preview: 'Message', receivedAt: '2026-10-20T10:00:00Z', from: [], to: [], cc: [], mailboxIds: ['inbox'], hasAttachment: false, isRead: false, isFlagged: false, isAnswered: false, isDraft: false, isJunk: false, isDeleted: false }
        await route.fulfill({ json: {
            actor: { id: 'dashboard-render-proof-user', canAccessAnyMailbox: false, canSend: true }, mailboxUser: 'dashboard-render-proof-user', mailboxAddress: 'user@example.test',
            accessibleAccounts: [{ id: 'dashboard-render-proof-user', name: 'Test', address: 'user@example.test' }], mailboxes: [{ id: 'inbox', name: 'Inbox', role: 'inbox', totalEmails: 1 }],
            selectedMailboxId: 'inbox', messages: [message], nextCursor: null,
            selectedMessage: params.get('messageId') ? { ...message, replyTo: [], bcc: [], attachments: [], textBody: '', htmlBody: '<img src="https://unknown.example.test/pixel.png">' } : null,
            filters: [], recentRecipients: [],
        } })
    })
    await page.route('**/api/mail/message/unknown-mail/reputation**', route => route.fulfill({ json: {
        messageId: 'unknown-mail', remoteUrls: [
            { id: idFor('https://unknown.example.test/pixel.png'), url: 'https://unknown.example.test/pixel.png', reputation: { provider: 'virustotal', status: 'unknown' } },
            { id: idFor('https://unavailable.example.test/pixel.png'), url: 'https://unavailable.example.test/pixel.png', reputation: { provider: 'virustotal', status: 'unavailable' } },
            { id: idFor('https://safe-poster.example.test/poster.png'), url: 'https://safe-poster.example.test/poster.png', reputation: { provider: 'virustotal', status: 'known', flagged: 0, total: 90 } },
        ],
    } }))
    await page.goto('/')
    await page.getByTestId('mail-message-unknown-mail').click()
    await expect(page.getByText(/0 safe images available/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Load safe remote images' })).toHaveCount(0)
})
