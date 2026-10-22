import { afterEach, expect, test } from 'bun:test'
import { getMailboxList, getMessage, listMessagePage } from '../src/utils/mail/jmap'

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

test('mailbox overview can reuse its JMAP session for the first message page', async () => {
    let sessionRequests = 0
    globalThis.fetch = (async (_url, init) => {
        if (!init?.body) {
            sessionRequests++
            return Response.json({ apiUrl: 'http://localhost/jmap', primaryAccounts: { 'urn:ietf:params:jmap:mail': 'account' } })
        }
        const [method] = JSON.parse(String(init.body)).methodCalls[0]
        if (method === 'Mailbox/get') return Response.json({ methodResponses: [[method, { list: [{ id: 'inbox', name: 'Inbox', role: 'inbox' }] }, 'mailboxes']] })
        if (method === 'Email/query') return Response.json({ methodResponses: [[method, { ids: ['message-1'] }, 'query']] })
        return Response.json({ methodResponses: [[method, { list: [{ id: 'message-1', subject: 'Test', preview: 'Preview' }] }, 'emails']] })
    }) as typeof fetch

    const mailboxData = await getMailboxList('user', 'secret')
    const page = await listMessagePage('user', 'secret', 'inbox', undefined, 50, mailboxData)
    const detail = await getMessage('user', 'secret', page.messages[0].id, mailboxData)

    expect(sessionRequests).toBe(1)
    expect(page.messages.map(message => message.id)).toEqual(['message-1'])
    expect(detail?.id).toBe('message-1')
})
