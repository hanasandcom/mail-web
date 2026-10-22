import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createServer } from '../src/server.ts'

const app = await createServer()
const realFetch = globalThis.fetch
const realIdentityUrl = process.env.HANASAND_IDENTITY_SERVICE_URL
let receivedUrl = ''
let receivedBody: unknown

beforeAll(() => {
    process.env.HANASAND_IDENTITY_SERVICE_URL = 'http://identity:8081'
    globalThis.fetch = (async (input, init) => {
        receivedUrl = String(input)
        receivedBody = init?.body ? JSON.parse(String(init.body)) : undefined
        if (receivedUrl.endsWith('/auth/sso/start')) {
            return new Response(JSON.stringify({ url: 'https://login.example.test/authorize' }), {
                status: 200,
                headers: { 'set-cookie': 'hanasand_auth_binding=abc; Domain=.hanasand.com; Secure; HttpOnly; SameSite=None; Path=/' },
            })
        }
        return Response.json({ id: 'eirik', name: 'Eirik', token: 'session', expires_at: '2030-01-01T00:00:00.000Z' })
    }) as typeof fetch
})

test('Mail password proxy delegates credential validation to Identity', async () => {
    const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'eirik', password: 'secret' },
    })

    expect(response.statusCode).toBe(200)
    expect(receivedUrl).toBe('http://identity:8081/api/auth/login/eirik')
    expect(receivedBody).toEqual({ password: 'secret' })
    expect(response.json().token).toBe('session')
})

test('Mail passkey proxies keep Identity as the verifier', async () => {
    const options = await app.inject({ method: 'GET', url: '/api/auth/passkeys/authenticate/options?username=eirik' })
    expect(options.statusCode).toBe(200)
    expect(receivedUrl).toBe('http://identity:8081/api/auth/passkeys/authenticate/options?username=eirik')

    const verify = await app.inject({
        method: 'POST',
        url: '/api/auth/passkeys/authenticate/verify',
        payload: { challengeId: '69d9ebea-3eba-4615-9429-1dd786629f63', credential: { id: 'credential' } },
    })
    expect(verify.statusCode).toBe(200)
    expect(receivedUrl).toBe('http://identity:8081/api/auth/passkeys/authenticate/verify')
})

test('Mail SSO proxy allows only same-site return paths and forwards the shared binding cookie', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/auth/sso/start?redirectPath=%2F' })
    expect(response.statusCode).toBe(303)
    expect(receivedUrl).toBe('http://identity:8081/api/auth/sso/start')
    expect(receivedBody).toEqual({ redirectPath: 'https://mail.hanasand.com/' })
    expect(response.headers.location).toBe('https://login.example.test/authorize')
    expect(response.headers['set-cookie']).toEqual([
        'hanasand_auth_binding=abc; Domain=.hanasand.com; Secure; HttpOnly; SameSite=None; Path=/',
    ])

    const rejected = await app.inject({ method: 'GET', url: '/api/auth/sso/start?redirectPath=%2F%2Fevil.test' })
    expect(rejected.statusCode).toBe(400)
})

afterAll(async () => {
    globalThis.fetch = realFetch
    if (realIdentityUrl === undefined) delete process.env.HANASAND_IDENTITY_SERVICE_URL
    else process.env.HANASAND_IDENTITY_SERVICE_URL = realIdentityUrl
    await app.close()
})
