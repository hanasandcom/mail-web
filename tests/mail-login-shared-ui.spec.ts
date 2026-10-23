import { expect, test } from '@playwright/test'

test('expired Mail sessions redirect to Identity even when stale cookies remain', async ({ request }) => {
    const response = await request.get('/?expired=true', {
        maxRedirects: 0,
        headers: { cookie: 'id=expired-user; access_token=expired-session' },
    })

    expect(response.status()).toBe(307)
    const destination = new URL(response.headers().location || '')
    expect(destination.origin).toBe('https://identity.hanasand.com')
    expect(destination.pathname).toBe('/login')
    expect(destination.searchParams.get('returnTo')).toBe('https://mail.hanasand.com/')
    expect(destination.searchParams.get('expired')).toBe('true')
    expect(await response.text()).not.toContain('Email or username')
})

test('unauthenticated Mail redirects reject external return URLs', async ({ request }) => {
    const response = await request.get('/?returnTo=https%3A%2F%2Fevil.example%2F', { maxRedirects: 0 })

    expect(response.status()).toBe(307)
    const destination = new URL(response.headers().location || '')
    expect(destination.origin).toBe('https://identity.hanasand.com')
    expect(destination.searchParams.get('returnTo')).toBe('https://mail.hanasand.com/')
})

test('the Identity return path preserves the requested shared mailbox', async ({ request }) => {
    const response = await request.get('/?mailboxUser=support%40hanasand.com', { maxRedirects: 0 })

    expect(response.status()).toBe(307)
    const destination = new URL(response.headers().location || '')
    expect(destination.searchParams.get('returnTo'))
        .toBe('https://mail.hanasand.com/?mailboxUser=support%40hanasand.com')
})
