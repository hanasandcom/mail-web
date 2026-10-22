import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { safeMailReturnPath } from '@/components/auth/returnPath'

const identityApiBase = (process.env.NEXT_PUBLIC_IDENTITY_API_URL || 'https://identity.hanasand.com/api').replace(/\/+$/, '')

export async function GET(req: NextRequest) {
    const returnPath = safeMailReturnPath(req.nextUrl.searchParams.get('redirectPath') || req.nextUrl.searchParams.get('returnTo') || '/')
    const binding = randomBytes(32).toString('base64url')
    const upstream = await fetch(`${identityApiBase}/auth/sso/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            binding,
            redirectPath: `https://mail.hanasand.com${returnPath}`,
            callbackUri: 'https://identity.hanasand.com/api/auth/sso/callback',
        }),
        cache: 'no-store',
        redirect: 'error',
    }).catch(() => null)
    const data = await upstream?.json().catch(() => null)
    if (!upstream?.ok || !data?.url || !safeProviderRedirect(data.url)) {
        const target = new URL('/', req.url)
        target.searchParams.set('error', data?.error || 'Google sign-in is unavailable.')
        const response = NextResponse.redirect(target, 303)
        response.headers.set('Cache-Control', 'no-store')
        response.headers.set('Referrer-Policy', 'no-referrer')
        return response
    }

    const response = NextResponse.redirect(data.url, 303)
    response.cookies.set('hanasand_auth_binding', binding, {
        httpOnly: true, secure: true, sameSite: 'none', domain: '.hanasand.com', path: '/', maxAge: 600,
    })
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('Referrer-Policy', 'no-referrer')
    return response
}

function safeProviderRedirect(location: string) {
    try {
        return new URL(location).protocol === 'https:'
    } catch {
        return false
    }
}
