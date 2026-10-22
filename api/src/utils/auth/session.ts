import type { FastifyReply, FastifyRequest } from 'fastify'

type Session = {
    user?: { id?: string, active?: boolean, deletion_scheduled_at?: string | null }
    refreshed?: { token?: string, expires_at?: string }
}

const MAIL_ORIGIN = 'https://mail.hanasand.com'
const MAX_COOKIE_HEADER_LENGTH = 8192
const SESSION_VALIDATION_BUDGET_MS = 4500

function singleHeader(value: string | string[] | undefined) {
    return typeof value === 'string' ? value.trim() : ''
}

export async function validateMailSession(req: FastifyRequest, reply: FastifyReply) {
    const authorization = singleHeader(req.headers.authorization)
    const headerId = singleHeader(req.headers.id)
    const cookieSession = authorization ? null : sessionFromCookies(req)
    const bearerToken = authorization.startsWith('Bearer ') && authorization.length <= 520
        ? authorization.slice('Bearer '.length)
        : ''
    const token = bearerToken || cookieSession?.token || ''
    const id = cookieSession ? cookieSession.id : headerId
    if (!token || !id || id.length > 200) {
        return null
    }
    const identityUrl = (process.env.HANASAND_IDENTITY_SERVICE_URL || '').replace(/\/+$/, '')
    const serviceToken = process.env.HANASAND_IDENTITY_SERVICE_TOKEN || ''
    if (!identityUrl || !serviceToken) {
        req.log.error('Mail API session validation is not configured.')
        return null
    }

    // Bind Identity validation to this Mail request, not caller-supplied forwarding metadata.
    const proof = singleHeader(req.headers.dpop)
    const method = req.method.toUpperCase()
    const target = `${MAIL_ORIGIN}${new URL(req.url, MAIL_ORIGIN).pathname}`
    const assertedMethod = singleHeader(req.headers['x-device-proof-method'])
    const assertedUrl = singleHeader(req.headers['x-device-proof-url'])
    if (assertedMethod && assertedMethod !== method) return null
    if (assertedUrl) {
        try {
            const url = new URL(assertedUrl)
            if (url.protocol !== 'https:' || url.origin !== MAIL_ORIGIN || url.username || url.password || url.search || url.hash || url.toString() !== target) return null
        } catch { return null }
    }
    const deviceProof = proof ? { proof, method, url: target } : undefined
    const tokens = cookieSession
        ? [cookieSession.token, cookieSession.fallbackToken].filter((candidate): candidate is string => Boolean(candidate))
        : [token]
    const deadline = Date.now() + SESSION_VALIDATION_BUDGET_MS
    let response: Response | undefined
    for (const [index, candidate] of tokens.entries()) {
        const remainingMs = deadline - Date.now()
        if (remainingMs <= 0) {
            req.log.warn('Identity session validation exceeded its total time budget.')
            reply.code(503).send({ error: 'Authentication service is temporarily unavailable.' })
            return null
        }
        for (let attempt = 0; attempt < 2; attempt += 1) {
            const attemptBudgetMs = deadline - Date.now()
            if (attemptBudgetMs <= 0) break
            try {
                response = await fetch(`${identityUrl}/api/auth/internal/sessions`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${serviceToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ operation: 'validate', id, token: candidate, ...(deviceProof ? { deviceProof } : {}) }),
                    signal: AbortSignal.timeout(attemptBudgetMs),
                })
            } catch (error) {
                const remainingMs = deadline - Date.now()
                if (attempt === 0 && remainingMs > 0 && !isAbortError(error)) {
                    await waitForIdentityRetry(remainingMs)
                    continue
                }
                req.log.warn({ error }, 'Identity session validation failed or timed out.')
                reply.code(503).send({ error: 'Authentication service is temporarily unavailable.' })
                return null
            }
            const remainingMs = deadline - Date.now()
            if (response.status >= 500 && attempt === 0 && remainingMs > 0) {
                await waitForIdentityRetry(remainingMs)
                continue
            }
            break
        }
        if (!response) {
            req.log.warn('Identity session validation exceeded its total time budget.')
            reply.code(503).send({ error: 'Authentication service is temporarily unavailable.' })
            return null
        }
        if (response.status !== 401 || index === tokens.length - 1) break
    }

    if (!response || response.status === 401) return null
    if (!response.ok) {
        req.log.warn({ status: response.status }, 'Identity session validation returned an error.')
        reply.code(503).send({ error: 'Authentication service is temporarily unavailable.' })
        return null
    }

    const session = await response.json().catch(() => null) as Session | null
    const userId = session?.user?.id
    if (!session || !userId || userId !== id || session.user?.active !== true || session.user?.deletion_scheduled_at) return null
    if (session.refreshed?.token && session.refreshed.expires_at) {
        if (cookieSession) {
            const cookie = refreshedSessionCookie(req, session.refreshed.token, session.refreshed.expires_at)
            if (cookie) reply.header('Set-Cookie', cookie)
        } else {
            reply.header('x-access-token', session.refreshed.token)
            reply.header('x-access-token-expires-at', session.refreshed.expires_at)
        }
    }
    return { id: userId, session }
}

function isAbortError(error: unknown) {
    return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
}

function waitForIdentityRetry(remainingMs: number) {
    return new Promise(resolve => setTimeout(resolve, Math.min(150, remainingMs)))
}

function sessionFromCookies(req: FastifyRequest) {
    const host = singleHeader(req.headers.host).split(':')[0].toLowerCase()
    const origin = singleHeader(req.headers.origin)
    const fetchSite = singleHeader(req.headers['sec-fetch-site'])
    const isMailHost = host === 'mail.hanasand.com'
    const isSameOriginRequest = origin === MAIL_ORIGIN || (!origin && fetchSite === 'same-origin')
    const isUnsafeMethod = req.method !== 'GET' && req.method !== 'HEAD'
    if (!isMailHost || !isSameOriginRequest || (isUnsafeMethod && origin !== MAIL_ORIGIN)) return null

    const cookieHeader = singleHeader(req.headers.cookie)
    if (!cookieHeader || cookieHeader.length > MAX_COOKIE_HEADER_LENGTH) return null
    const id = cookieValue(cookieHeader, 'id')
    const mailToken = cookieValue(cookieHeader, 'mail_access_token')
    const sharedToken = cookieValue(cookieHeader, 'access_token')
    const token = mailToken === null ? sharedToken : mailToken
    if (!id || id.length > 200 || !token || token.length > 500) return null
    const fallbackToken = mailToken !== null && sharedToken && sharedToken !== mailToken ? sharedToken : ''
    return { id, token, fallbackToken }
}

function cookieValue(header: string, name: string): string | null {
    const values = header.split(';').map(part => part.trim()).filter(part => part.startsWith(`${name}=`))
    if (values.length === 0) return null
    if (values.length !== 1) return ''
    try { return decodeURIComponent(values[0].slice(name.length + 1)) } catch { return '' }
}

function refreshedSessionCookie(req: FastifyRequest, token: string, expiresAt: string) {
    const expiry = new Date(expiresAt)
    if (!Number.isFinite(expiry.getTime())) return ''
    const host = singleHeader(req.headers.host).split(':')[0].toLowerCase()
    const forwardedProto = singleHeader(req.headers['x-forwarded-proto']).split(',')[0].trim().toLowerCase()
    const secure = host === 'mail.hanasand.com' || forwardedProto === 'https' ? '; Secure' : ''
    return `mail_access_token=${encodeURIComponent(token)}; Expires=${expiry.toUTCString()}; Path=/; HttpOnly; SameSite=Lax${secure}`
}
