import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { resolveMailProxyAuth } from '@/utils/mail/proxyAuth'

type Context = { params: Promise<{ path?: string[] }> }
const API_BASE = (process.env.HANASAND_API_BASE || 'https://api.hanasand.com/api').replace(/\/+$/, '')
const HOP_HEADERS = new Set(['connection', 'content-encoding', 'content-length', 'host', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade'])
const ALLOWED_ORIGINS = new Set(['https://hanasand.com'])

function corsHeaders(req: NextRequest) {
    const headers = new Headers({ Vary: 'Origin' })
    const origin = req.headers.get('origin')
    if (origin && ALLOWED_ORIGINS.has(origin)) {
        headers.set('Access-Control-Allow-Origin', origin)
        headers.set('Access-Control-Allow-Credentials', 'true')
        headers.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, DELETE, OPTIONS')
        headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, id')
        headers.set('Access-Control-Max-Age', '600')
    }
    return headers
}

async function handler(req: NextRequest, context: Context) {
    const cors = corsHeaders(req)
    if (req.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers: cors })

    const { path = [] } = await context.params
    if (path[0] !== 'mail' || path.length < 2 || path.some(part => part === '.' || part === '..')) {
        const headers = new Headers(cors)
        headers.set('cache-control', 'no-store')
        return NextResponse.json({ error: 'Not found.' }, { status: 404, headers })
    }

    const jar = await cookies()
    // The mail client sends its current credentials explicitly. Prefer them
    // over cookies because browsers can retain a stale duplicate cookie while
    // the page has already received a refreshed token.
    const { token, id } = resolveMailProxyAuth(
        req.headers,
        jar.get('access_token')?.value || '',
        jar.get('id')?.value || '',
    )
    if (!token || !id) {
        const headers = new Headers(cors)
        headers.set('cache-control', 'no-store')
        return NextResponse.json({ error: 'Unauthorized.' }, { status: 401, headers })
    }

    const target = new URL(`${API_BASE}/${path.map(encodeURIComponent).join('/')}`)
    target.search = req.nextUrl.search
    const headers = new Headers()
    req.headers.forEach((value, key) => {
        if (!HOP_HEADERS.has(key.toLowerCase()) && key.toLowerCase() !== 'cookie' && key.toLowerCase() !== 'authorization' && key.toLowerCase() !== 'id' && key.toLowerCase() !== 'origin') headers.set(key, value)
    })
    headers.set('Authorization', `Bearer ${token}`)
    headers.set('id', id)

    try {
        const response = await fetch(target, {
            method: req.method,
            headers,
            body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
            cache: 'no-store',
            signal: AbortSignal.timeout(15_000),
            ...(req.method === 'GET' || req.method === 'HEAD' ? {} : { duplex: 'half' as const }),
        } as RequestInit & { duplex?: 'half' })
        const responseHeaders = new Headers(cors)
        response.headers.forEach((value, key) => {
            if (!HOP_HEADERS.has(key.toLowerCase()) && key.toLowerCase() !== 'set-cookie') responseHeaders.set(key, value)
        })
        responseHeaders.set('cache-control', 'no-store')
        const result = new NextResponse(response.body, { status: response.status, headers: responseHeaders })
        const refreshedToken = response.headers.get('x-access-token')
        const expires = response.headers.get('x-access-token-expires-at')
        if (refreshedToken) result.cookies.set('access_token', refreshedToken, { domain: '.hanasand.com', path: '/', secure: true, sameSite: 'lax', expires: expires ? new Date(expires) : undefined })
        return result
    } catch {
        const responseHeaders = new Headers(cors)
        responseHeaders.set('cache-control', 'no-store')
        return NextResponse.json({ error: 'Mail service is temporarily unavailable.' }, { status: 503, headers: responseHeaders })
    }
}

export const GET = handler
export const HEAD = handler
export const POST = handler
export const DELETE = handler
export const OPTIONS = handler
