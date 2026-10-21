import { afterEach, beforeEach, expect, test } from 'bun:test'
import { createServer } from '../src/server.ts'

let app: Awaited<ReturnType<typeof createServer>>

beforeEach(async () => {
    app = await createServer()
    await app.ready()
})

afterEach(async () => {
    await app.close()
})

test('registers every browser Mail API route on the dedicated service', async () => {
    const routes = [
        { method: 'GET', url: '/api/mail/overview' },
        { method: 'GET', url: '/api/mail/search' },
        { method: 'POST', url: '/api/mail/send' },
        { method: 'POST', url: '/api/mail/mailboxes' },
        { method: 'POST', url: '/api/mail/message/:id/action' },
        { method: 'GET', url: '/api/mail/message/:id/reputation' },
        { method: 'POST', url: '/api/mail/filters' },
        { method: 'DELETE', url: '/api/mail/filters/:id' },
        { method: 'GET', url: '/api/mail/blob/:mailboxUser/:blobId/:name' },
    ] as const
    for (const route of routes) {
        expect(app.hasRoute(route)).toBe(true)
    }
})

test('rejects overview requests with no valid Identity session', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/mail/overview', headers: { authorization: 'Bearer token', id: 'user' } })
    expect(response.statusCode).toBe(401)
})
