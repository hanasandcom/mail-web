import { afterEach, beforeEach, expect, test } from 'bun:test'

const prior = {
    identityUrl: process.env.HANASAND_IDENTITY_SERVICE_URL,
    identityToken: process.env.HANASAND_IDENTITY_SERVICE_TOKEN,
}
const { validateMailSession } = await import('../src/utils/auth/session.ts')
const originalFetch = globalThis.fetch

beforeEach(() => {
    process.env.HANASAND_IDENTITY_SERVICE_URL = 'http://identity.test'
    process.env.HANASAND_IDENTITY_SERVICE_TOKEN = 'service-token-test-only'
})

afterEach(() => {
    globalThis.fetch = originalFetch
    process.env.HANASAND_IDENTITY_SERVICE_URL = prior.identityUrl
    process.env.HANASAND_IDENTITY_SERVICE_TOKEN = prior.identityToken
})

test('requires a bearer session and user id before contacting Identity', async () => {
    let calls = 0
    globalThis.fetch = (async () => {
        calls += 1
        throw new Error('Unexpected Identity request')
    }) as typeof fetch
    const sent: unknown[] = []
    const reply = { code: () => reply, send: (payload: unknown) => sent.push(payload), header: () => reply } as never
    const result = await validateMailSession({
        method: 'GET', url: '/api/mail/overview?mailboxId=inbox', headers: { authorization: 'Bearer token' },
        log: { error() {}, warn() {} },
    } as never, reply)

    expect(result).toBeNull()
    expect(calls).toBe(0)
    expect(sent).toHaveLength(0)
})

test('validates the bearer session with Identity and returns refreshed-session headers', async () => {
    let requestBody: Record<string, unknown> | undefined
    const responseHeaders = new Map<string, string>()
    globalThis.fetch = (async (input, init) => {
        expect(String(input)).toBe('http://identity.test/api/auth/internal/sessions')
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer service-token-test-only')
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
        return Response.json({
            user: { id: 'user', active: true },
            refreshed: { token: 'rotated-token', expires_at: '2030-01-01T00:00:00.000Z' },
        })
    }) as typeof fetch
    const reply = {
        header: (name: string, value: string) => { responseHeaders.set(name, value); return reply },
        code: () => reply,
        send() { return reply },
    } as never
    const result = await validateMailSession({
        method: 'GET', url: '/api/mail/overview?mailboxId=inbox', headers: { authorization: 'Bearer session-token', id: 'user' },
        log: { error() {}, warn() {} },
    } as never, reply)

    expect(result?.id).toBe('user')
    expect(requestBody).toEqual({
        operation: 'validate', id: 'user', token: 'session-token',
    })
    expect(requestBody).not.toHaveProperty('trustedInternal')
    expect(responseHeaders.get('x-access-token')).toBe('rotated-token')
})
