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

test('retries a transient Identity connection failure within the existing validation budget', async () => {
    let calls = 0
    globalThis.fetch = (async () => {
        calls += 1
        if (calls === 1) throw new TypeError('fetch failed: connection refused')
        return Response.json({ user: { id: 'user', active: true } })
    }) as typeof fetch
    const reply = { code: () => reply, send: () => reply, header: () => reply } as never

    const result = await validateMailSession({
        method: 'GET', url: '/api/mail/overview',
        headers: { authorization: 'Bearer session-token', id: 'user' },
        log: { error() {}, warn() {} },
    } as never, reply)

    expect(result?.id).toBe('user')
    expect(calls).toBe(2)
})

test('retries a transient Identity server error once before returning a session', async () => {
    let calls = 0
    globalThis.fetch = (async () => {
        calls += 1
        if (calls === 1) return new Response(null, { status: 503 })
        return Response.json({ user: { id: 'user', active: true } })
    }) as typeof fetch
    const reply = { code: () => reply, send: () => reply, header: () => reply } as never

    const result = await validateMailSession({
        method: 'GET', url: '/api/mail/overview',
        headers: { authorization: 'Bearer session-token', id: 'user' },
        log: { error() {}, warn() {} },
    } as never, reply)

    expect(result?.id).toBe('user')
    expect(calls).toBe(2)
})

test('validates a same-origin Mail cookie without exposing a rotated token to JavaScript', async () => {
    let requestBody: Record<string, unknown> | undefined
    const responseHeaders = new Map<string, string>()
    globalThis.fetch = (async (_input, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
        return Response.json({
            user: { id: 'user', active: true },
            refreshed: { token: 'rotated-token', expires_at: '2030-01-01T00:00:00.000Z' },
        })
    }) as typeof fetch
    const reply = {
        header: (name: string, value: string) => { responseHeaders.set(name.toLowerCase(), value); return reply },
        code: () => reply,
        send() { return reply },
    } as never
    const result = await validateMailSession({
        method: 'GET', url: '/api/mail/overview',
        headers: {
            host: 'mail.hanasand.com',
            cookie: 'id=user; access_token=shared-dashboard-token',
            origin: 'https://mail.hanasand.com',
            'x-forwarded-proto': 'https',
        },
        log: { error() {}, warn() {} },
    } as never, reply)

    expect(result?.id).toBe('user')
    expect(requestBody).toEqual({ operation: 'validate', id: 'user', token: 'shared-dashboard-token' })
    expect(responseHeaders.get('set-cookie')).toContain('mail_access_token=rotated-token')
    expect(responseHeaders.get('set-cookie')).toContain('HttpOnly; SameSite=Lax; Secure')
    expect(responseHeaders.get('set-cookie')).not.toContain('Domain=')
    expect(responseHeaders.get('set-cookie')).not.toMatch(/^access_token=/)
    expect(responseHeaders.has('x-access-token')).toBe(false)
})

test('does not accept cookie sessions from another origin or on unsafe requests without an Origin', async () => {
    let calls = 0
    globalThis.fetch = (async () => {
        calls += 1
        return Response.json({ user: { id: 'user', active: true } })
    }) as typeof fetch
    const reply = { code: () => reply, send: () => reply, header: () => reply } as never
    const request = (method: string, origin: string, fetchSite = 'same-origin') => ({
        method, url: '/api/mail/send',
        headers: {
            host: 'mail.hanasand.com', cookie: 'id=user; mail_access_token=session-token',
            ...(origin ? { origin } : {}), 'sec-fetch-site': fetchSite,
        },
        log: { error() {}, warn() {} },
    })

    const crossOrigin = await validateMailSession(request('GET', 'https://evil.example') as never, reply)
    const unsafeWithoutOrigin = await validateMailSession(request('POST', '') as never, reply)

    expect(crossOrigin).toBeNull()
    expect(unsafeWithoutOrigin).toBeNull()
    expect(calls).toBe(0)
})

test('prefers the Mail-scoped rotated cookie and rejects cross-site cookie overview reads', async () => {
    let requestBody: Record<string, unknown> | undefined
    let calls = 0
    globalThis.fetch = (async (_input, init) => {
        calls += 1
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
        return Response.json({ user: { id: 'user', active: true } })
    }) as typeof fetch
    const reply = { code: () => reply, send: () => reply, header: () => reply } as never
    const cookie = 'id=user; access_token=shared-token; mail_access_token=mail-token'
    const allowed = await validateMailSession({
        method: 'GET', url: '/api/mail/overview',
        headers: { host: 'mail.hanasand.com', cookie, origin: 'https://mail.hanasand.com' },
        log: { error() {}, warn() {} },
    } as never, reply)
    const denied = await validateMailSession({
        method: 'GET', url: '/api/mail/overview',
        headers: { host: 'mail.hanasand.com', cookie, 'sec-fetch-site': 'same-site' },
        log: { error() {}, warn() {} },
    } as never, reply)

    expect(allowed?.id).toBe('user')
    expect(requestBody).toEqual({ operation: 'validate', id: 'user', token: 'mail-token' })
    expect(denied).toBeNull()
    expect(calls).toBe(1)
})

test('falls back to the shared session after a stale Mail-scoped token is rejected', async () => {
    const seen: string[] = []
    const responseHeaders = new Map<string, string>()
    globalThis.fetch = (async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as { token: string }
        seen.push(body.token)
        if (body.token === 'stale-mail-token') return new Response(null, { status: 401 })
        return Response.json({ user: { id: 'user', active: true } })
    }) as typeof fetch
    const reply = {
        header: (name: string, value: string) => { responseHeaders.set(name.toLowerCase(), value); return reply },
        code: () => reply,
        send() { return reply },
    } as never
    const result = await validateMailSession({
        method: 'GET', url: '/api/mail/overview',
        headers: {
            host: 'mail.hanasand.com',
            cookie: 'id=user; mail_access_token=stale-mail-token; access_token=current-dashboard-token',
            origin: 'https://mail.hanasand.com',
        },
        log: { error() {}, warn() {} },
    } as never, reply)

    expect(result?.id).toBe('user')
    expect(seen).toEqual(['stale-mail-token', 'current-dashboard-token'])
})

test('bounds all Identity attempts to one session-validation budget', async () => {
    let calls = 0
    const sent: unknown[] = []
    globalThis.fetch = (async (_input, init) => {
        calls += 1
        if (calls === 1) return new Response(null, { status: 401 })
        return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('Identity timed out')), { once: true })
        })
    }) as typeof fetch
    const reply = {
        code: (status: number) => { expect(status).toBe(503); return reply },
        send: (payload: unknown) => { sent.push(payload); return reply },
        header: () => reply,
    } as never
    const startedAt = Date.now()
    const result = await validateMailSession({
        method: 'GET', url: '/api/mail/overview',
        headers: {
            host: 'mail.hanasand.com',
            cookie: 'id=user; mail_access_token=stale-mail-token; access_token=current-dashboard-token',
            origin: 'https://mail.hanasand.com',
        },
        log: { error() {}, warn() {} },
    } as never, reply)

    expect(result).toBeNull()
    expect(calls).toBe(2)
    expect(Date.now() - startedAt).toBeLessThan(5500)
    expect(sent).toEqual([{ error: 'Authentication service is temporarily unavailable.' }])
})

test('rejects ambiguous duplicate session cookies instead of choosing one', async () => {
    let calls = 0
    globalThis.fetch = (async () => {
        calls += 1
        throw new Error('An ambiguous cookie must not reach Identity')
    }) as typeof fetch
    const reply = { code: () => reply, send: () => reply, header: () => reply } as never
    const result = await validateMailSession({
        method: 'GET', url: '/api/mail/overview',
        headers: {
            host: 'mail.hanasand.com',
            cookie: 'id=user; access_token=legacy; mail_access_token=first; mail_access_token=second',
            origin: 'https://mail.hanasand.com',
        },
        log: { error() {}, warn() {} },
    } as never, reply)

    expect(result).toBeNull()
    expect(calls).toBe(0)
})

test('forwards a native device proof bound to the actual Mail method and public path', async () => {
    let requestBody: Record<string, unknown> | undefined
    globalThis.fetch = (async (_input, init) => {
        requestBody = JSON.parse(String(init?.body))
        return Response.json({ user: { id: 'user', active: true } })
    }) as typeof fetch
    const reply = { code: () => reply, send: () => reply, header: () => reply } as never
    const result = await validateMailSession({
        method: 'GET', url: '/api/mail/overview?mailboxId=inbox',
        headers: { authorization: 'Bearer session-token', id: 'user', dpop: 'synthetic-proof', 'x-device-proof-url': 'https://mail.hanasand.com/api/mail/overview', 'x-device-proof-method': 'GET' },
        log: { error() {}, warn() {} },
    } as never, reply)
    expect(result?.id).toBe('user')
    expect(requestBody).toEqual({ operation: 'validate', id: 'user', token: 'session-token', deviceProof: { proof: 'synthetic-proof', method: 'GET', url: 'https://mail.hanasand.com/api/mail/overview' } })
    expect(requestBody).not.toHaveProperty('trustedInternal')
})

test('does not retry a rejected device proof or silently fall back to unbound validation', async () => {
    const bodies: Record<string, unknown>[] = []
    globalThis.fetch = (async (_input, init) => { bodies.push(JSON.parse(String(init?.body))); return new Response(null, { status: 401 }) }) as typeof fetch
    const reply = { code: () => reply, send: () => reply, header: () => reply } as never
    const result = await validateMailSession({
        method: 'POST', url: '/api/mail/mailboxes',
        headers: { authorization: 'Bearer session-token', id: 'user', dpop: 'replayed-proof' },
        log: { error() {}, warn() {} },
    } as never, reply)
    expect(result).toBeNull()
    expect(bodies).toHaveLength(1)
    expect(bodies[0].deviceProof).toEqual({ proof: 'replayed-proof', method: 'POST', url: 'https://mail.hanasand.com/api/mail/mailboxes' })
    expect(bodies[0]).not.toHaveProperty('trustedInternal')
})

test('rejects asserted methods and targets that do not describe the actual Mail operation', async () => {
    let calls = 0
    globalThis.fetch = (async () => { calls += 1; throw new Error('Invalid forwarding metadata must not reach Identity') }) as typeof fetch
    const reply = { code: () => reply, send: () => reply, header: () => reply } as never
    for (const headers of [
        { 'x-device-proof-method': 'GET' },
        { 'x-device-proof-url': 'https://mail.hanasand.com/api/mail/overview' },
        { 'x-device-proof-url': 'http://mail.hanasand.com/api/mail/mailboxes' },
        { 'x-device-proof-url': 'https://user:secret@mail.hanasand.com/api/mail/mailboxes' },
        { 'x-device-proof-url': 'https://other.example/api/mail/mailboxes' },
        { 'x-device-proof-url': 'https://mail.hanasand.com/api/mail/mailboxes?query=value' },
        { 'x-device-proof-url': 'https://mail.hanasand.com/api/mail/mailboxes#fragment' },
    ]) {
        const result = await validateMailSession({ method: 'POST', url: '/api/mail/mailboxes', headers: { authorization: 'Bearer session-token', id: 'user', dpop: 'synthetic-proof', ...headers }, log: { error() {}, warn() {} } } as never, reply)
        expect(result).toBeNull()
    }
    expect(calls).toBe(0)
})
