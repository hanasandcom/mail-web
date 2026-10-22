import assert from 'node:assert/strict'
import test from 'node:test'
import { NextRequest } from 'next/server'
import { GET } from '../src/app/api/auth/sso/start/route'

test('Mail SSO start uses the canonical Hanasand callback and a same-site return URL', () => {
    const request = new NextRequest('https://mail.hanasand.com/api/auth/sso/start?returnTo=%2F%3FmailboxUser%3Dalice')
    const response = GET(request)
    const target = new URL(response.headers.get('location') || '')

    assert.equal(response.status, 303)
    assert.equal(target.origin, 'https://hanasand.com')
    assert.equal(target.pathname, '/api/auth/sso/start')
    assert.equal(target.searchParams.get('returnTo'), 'https://mail.hanasand.com/?mailboxUser=alice')
    assert.equal(response.headers.get('cache-control'), 'no-store')
})

test('Mail SSO return path rejects an external URL', () => {
    const request = new NextRequest('https://mail.hanasand.com/api/auth/sso/start?returnTo=https%3A%2F%2Fevil.example')
    const response = GET(request)
    const target = new URL(response.headers.get('location') || '')

    assert.equal(target.searchParams.get('returnTo'), 'https://mail.hanasand.com/')
})
