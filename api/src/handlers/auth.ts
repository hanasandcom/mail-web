import type { FastifyReply, FastifyRequest } from 'fastify'

type LoginBody = { username?: unknown, password?: unknown }

const mailOrigin = 'https://mail.hanasand.com'
const timeoutMs = 15_000

function identityUrl(path: string) {
    const base = (process.env.HANASAND_IDENTITY_SERVICE_URL || '').replace(/\/+$/, '')
    return `${base}/api${path}`
}

async function proxyJson(reply: FastifyReply, path: string, init?: RequestInit) {
    reply.header('Cache-Control', 'no-store')
    try {
        const response = await fetch(identityUrl(path), {
            ...init,
            cache: 'no-store',
            redirect: 'error',
            signal: AbortSignal.timeout(timeoutMs),
        })
        const body = await response.json().catch(() => ({ error: 'Authentication service returned an invalid response.' }))
        return reply.code(response.status).send(body)
    } catch (error) {
        reply.log.warn({ error }, 'Identity authentication request failed.')
        return reply.code(503).send({ error: 'Authentication service is temporarily unavailable.' })
    }
}

export async function postIdentityLogin(req: FastifyRequest, reply: FastifyReply) {
    const body = req.body as LoginBody | undefined
    const username = typeof body?.username === 'string' ? body.username.trim() : ''
    const password = typeof body?.password === 'string' ? body.password : ''
    if (!username || username.length > 200 || !password || password.length > 1024) {
        return reply.code(400).send({ error: 'Username and password are required.' })
    }
    return proxyJson(reply, `/auth/login/${encodeURIComponent(username)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
    })
}

export async function getPasskeyOptions(req: FastifyRequest, reply: FastifyReply) {
    const query = req.query as { username?: unknown } | undefined
    const username = typeof query?.username === 'string' ? query.username.trim().slice(0, 200) : ''
    const search = username ? `?username=${encodeURIComponent(username)}` : ''
    return proxyJson(reply, `/auth/passkeys/authenticate/options${search}`, { method: 'GET' })
}

export async function postPasskeyVerify(req: FastifyRequest, reply: FastifyReply) {
    return proxyJson(reply, '/auth/passkeys/authenticate/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body ?? {}),
    })
}

export async function getSsoStart(req: FastifyRequest, reply: FastifyReply) {
    const query = req.query as { redirectPath?: unknown } | undefined
    const redirectPath = typeof query?.redirectPath === 'string' ? query.redirectPath : '/'
    if (!redirectPath.startsWith('/') || redirectPath.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(redirectPath)) {
        return reply.code(400).send({ error: 'Invalid sign-in return path.' })
    }

    reply.header('Cache-Control', 'no-store')
    try {
        const response = await fetch(identityUrl('/auth/sso/start'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ redirectPath: new URL(redirectPath, mailOrigin).toString() }),
            cache: 'no-store',
            redirect: 'error',
            signal: AbortSignal.timeout(timeoutMs),
        })
        const body = await response.json().catch(() => null) as { url?: unknown, error?: string } | null
        if (!response.ok || typeof body?.url !== 'string') {
            return reply.code(response.status).send(body || { error: 'SSO sign-in is unavailable.' })
        }
        const target = new URL(body.url)
        if (target.protocol !== 'https:') return reply.code(502).send({ error: 'Identity returned an invalid SSO destination.' })
        const cookies = response.headers.getSetCookie?.() || []
        if (cookies.length) reply.header('Set-Cookie', cookies)
        return reply.code(303).header('Location', target.toString()).send()
    } catch (error) {
        reply.log.warn({ error }, 'Identity SSO start failed.')
        return reply.code(503).send({ error: 'Authentication service is temporarily unavailable.' })
    }
}
