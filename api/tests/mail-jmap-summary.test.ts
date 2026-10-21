import { afterEach, expect, test } from 'bun:test'
import { listMessagePage } from '../src/utils/mail/jmap'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

test('mail list pages fetch summaries without message bodies', async () => {
    const emailRequests: Record<string, unknown>[] = []
    globalThis.fetch = (async (_url, init) => {
        if (!init?.body) {
            return Response.json({
                apiUrl: 'http://localhost/jmap',
                primaryAccounts: { 'urn:ietf:params:jmap:mail': 'account' },
            })
        }
        const [method, args] = JSON.parse(String(init.body)).methodCalls[0]
        if (method === 'Email/query') {
            return Response.json({ methodResponses: [[method, { ids: ['contact-ticket'] }, 'query']] })
        }
        emailRequests.push(args)
        return Response.json({ methodResponses: [[method, { list: [{
            id: 'contact-ticket',
            subject: '[HS-20261021-BFA59C81] Contact request',
            from: [{ email: 'noreply@hanasand.com' }],
            preview: 'Ticket details',
        }] }, 'get']] })
    }) as typeof fetch

    const page = await listMessagePage('user', 'secret', 'inbox')

    expect(page.messages).toHaveLength(1)
    expect(emailRequests).toHaveLength(1)
    expect(emailRequests[0].fetchAllBodyValues).toBeUndefined()
    expect(emailRequests[0].properties).not.toContain('bodyValues')
})
