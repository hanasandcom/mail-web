import assert from 'node:assert/strict'
import test from 'node:test'
import { NextRequest } from 'next/server'
import { GET } from '../src/app/api/auth/sso/start/route'

test('Mail SSO start goes directly to Identity and uses the shared Identity callback', async () => {
    const request = new NextRequest('https://mail.hanasand.com/api/auth/sso/start?returnTo=%2F%3FmailboxUser%3Dalice')
    const previousFetch = globalThis.fetch
    let requestBody: Record<string, unknown> | undefined
    globalThis.fetch = (async (_input, init) => {
        requestBody = JSON.parse(String(init?.body))
        return Response.json({ url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test' })
    }) as typeof fetch
    try {
        const response = await GET(request)
        const target = new URL(response.headers.get('location') || '')

        assert.equal(response.status, 303)
        assert.equal(target.origin, 'https://accounts.google.com')
        assert.equal(requestBody?.callbackUri, 'https://identity.hanasand.com/api/auth/sso/callback')
        assert.equal(requestBody?.redirectPath, 'https://mail.hanasand.com/?mailboxUser=alice')
        assert.equal(response.cookies.get('hanasand_auth_binding')?.value.length, 43)
        assert.equal(response.headers.get('cache-control'), 'no-store')
    } finally {
        globalThis.fetch = previousFetch
    }
})

test('Mail SSO return path rejects an external URL', async () => {
    const request = new NextRequest('https://mail.hanasand.com/api/auth/sso/start?returnTo=https%3A%2F%2Fevil.example')
    const previousFetch = globalThis.fetch
    let requestBody: Record<string, unknown> | undefined
    globalThis.fetch = (async (_input, init) => {
        requestBody = JSON.parse(String(init?.body))
        return Response.json({ url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test' })
    }) as typeof fetch
    try {
        await GET(request)
        assert.equal(requestBody?.redirectPath, 'https://mail.hanasand.com/')
    } finally {
        globalThis.fetch = previousFetch
    }

})
