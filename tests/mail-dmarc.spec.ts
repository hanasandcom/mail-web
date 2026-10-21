import { expect, test } from '@playwright/test'
import { gzipSync, strToU8, zipSync } from 'fflate'

const xml = '<?xml version="1.0"?><feedback><report_metadata><org_name>Google</org_name><report_id>report-123</report_id><date_range><begin>1789689600</begin><end>1789775999</end></date_range></report_metadata><policy_published><domain>hanasand.com</domain><p>reject</p></policy_published><record><row><source_ip>192.0.2.1</source_ip><count>12</count><policy_evaluated><disposition>none</disposition><dkim>pass</dkim><spf>fail</spf></policy_evaluated></row></record><record><row><source_ip>2001:db8::1</source_ip><count>3</count><policy_evaluated><disposition>reject</disposition><dkim>fail</dkim><spf>fail</spf></policy_evaluated></row></record></feedback>'

test('DMARC attachments render inline with safe failures and retries', async ({ page, context, baseURL }) => {
    test.skip(!/localhost|127\.0\.0\.1/.test(baseURL || ''), 'Uses loopback-only render-proof auth')
    await context.setExtraHTTPHeaders({ 'x-hanasand-render-proof-auth': 'local-dashboard-render-proof' })
    await context.addCookies([
        { name: 'id', value: 'dashboard-render-proof-user', url: baseURL! },
        { name: 'access_token', value: 'local-dashboard-render-proof-token', url: baseURL! },
    ])
    const message = { id: 'report', subject: 'Report domain: hanasand.com', from: [{ email: 'noreply-dmarc-support@google.com' }], to: [{ email: 'postmaster@hanasand.com' }], cc: [], bcc: [], replyTo: [], receivedAt: '2026-09-19T10:00:00Z', mailboxIds: ['inbox'], preview: '', isRead: true,
        attachments: [{ blobId: 'zip', name: 'google-report.zip', size: 789, type: 'application/zip' }], textBody: '', htmlBody: '' }
    await page.route('**/api/mail/overview**', route => route.fulfill({ json: {
        actor: { id: 'dashboard-render-proof-user' }, mailboxUser: 'dashboard-render-proof-user', mailboxAddress: 'postmaster@hanasand.com', accessibleAccounts: [],
        mailboxes: [{ id: 'inbox', name: 'Inbox', role: 'inbox', totalEmails: 1 }], selectedMailboxId: 'inbox', messages: [message], nextCursor: null,
        selectedMessage: new URL(route.request().url()).searchParams.get('messageId') ? message : null,
    } }))
    let body = zipSync({ 'report.xml': strToU8(xml) })
    let requests = 0
    await page.route('**/api/mail/blob/**', route => {
        requests++
        return route.fulfill({ body: Buffer.from(body), contentType: 'application/zip' })
    })
    await page.route('**/api/mail/message/*/action', route => route.fulfill({ json: { ok: true } }))
    await page.goto('/')
    await page.getByTestId('mail-message-report').click()
    const report = page.getByRole('region', { name: 'DMARC report google-report.zip' })
    await expect(report.getByRole('heading')).toHaveText('DMARC report · hanasand.com')
    await expect(report).toContainText('15 messages')
    await expect(report).toContainText('12 passed')
    await expect(report).toContainText('3 did not pass')
    await expect(report.getByRole('row')).toHaveCount(3)
    await expect(report).toContainText('2001:db8::1')
    await expect(page.getByRole('link').filter({ hasText: 'google-report.zip' })).toBeVisible()
    await report.getByText('Original XML · report report-123').click()
    await expect(report.locator('pre')).toContainText('<feedback>')
    const loadedRequests = requests
    await page.waitForTimeout(11_000)
    expect(requests).toBe(loadedRequests)
    // A corrupt report must not prevent reading the message or its attachment.
    await page.getByRole('button', { name: 'Back to Inbox', exact: true }).click()
    body = zipSync({ 'bad.xml': strToU8('<feedback><broken>') })
    await page.getByTestId('mail-message-report').click()
    await expect(report.getByRole('button', { name: 'Retry' })).toBeVisible()
    body = gzipSync(strToU8(xml))
    await report.getByRole('button', { name: 'Retry' }).click()
    await expect(report.getByRole('heading')).toBeVisible()
    await page.getByRole('button', { name: 'Back to Inbox', exact: true }).click()
    body = zipSync({ 'large.xml': strToU8(' '.repeat(3 * 1024 * 1024)) })
    await page.getByTestId('mail-message-report').click()
    await expect(report).toContainText('too large to preview')
    body = zipSync({ 'entities.xml': strToU8('<!DOCTYPE feedback [<!ENTITY x SYSTEM "https://example.invalid/secret">]>' + xml.replace('<?xml version="1.0"?>', '')) })
    await report.getByRole('button', { name: 'Retry' }).click()
    await expect(report).toContainText('unsupported XML declarations')
    body = zipSync({ 'report.xml': strToU8(xml.replace('Google', '&lt;img src=x onerror=alert(1)&gt;')) })
    await report.getByRole('button', { name: 'Retry' }).click()
    await expect(report.getByRole('heading')).toBeVisible()
    await expect(report.locator('img')).toHaveCount(0)
    for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 })
        expect(await report.evaluate(el => el.getBoundingClientRect().right <= innerWidth)).toBe(true)
    }
})
