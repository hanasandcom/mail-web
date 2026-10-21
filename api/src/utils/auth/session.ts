import type { FastifyReply, FastifyRequest } from 'fastify'

type Session = {
    user?: { id?: string, active?: boolean, deletion_scheduled_at?: string | null }
    refreshed?: { token?: string, expires_at?: string }
}

function singleHeader(value: string | string[] | undefined) {
    return typeof value === 'string' ? value.trim() : ''
}

export async function validateMailSession(req: FastifyRequest, reply: FastifyReply) {
    const authorization = singleHeader(req.headers.authorization)
    const id = singleHeader(req.headers.id)
    if (!authorization.startsWith('Bearer ') || authorization.length > 520 || !id || id.length > 200) {
        return null
    }
    const identityUrl = (process.env.HANASAND_IDENTITY_SERVICE_URL || '').replace(/\/+$/, '')
    const serviceToken = process.env.HANASAND_IDENTITY_SERVICE_TOKEN || ''
    if (!identityUrl || !serviceToken) {
        req.log.error('Mail API session validation is not configured.')
        return null
    }
    let response: Response
    try {
        response = await fetch(`${identityUrl}/api/auth/internal/sessions`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${serviceToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                operation: 'validate',
                id,
                token: authorization.slice('Bearer '.length),
            }),
            signal: AbortSignal.timeout(5000),
        })
    } catch (error) {
        req.log.warn({ error }, 'Identity session validation failed to connect.')
        reply.code(503).send({ error: 'Authentication service is temporarily unavailable.' })
        return null
    }
    if (response.status === 401) return null
    if (!response.ok) {
        req.log.warn({ status: response.status }, 'Identity session validation returned an error.')
        reply.code(503).send({ error: 'Authentication service is temporarily unavailable.' })
        return null
    }

    const session = await response.json().catch(() => null) as Session | null
    const userId = session?.user?.id
    if (!session || !userId || userId !== id || session.user?.active !== true || session.user?.deletion_scheduled_at) return null
    if (session.refreshed?.token && session.refreshed.expires_at) {
        reply.header('x-access-token', session.refreshed.token)
        reply.header('x-access-token-expires-at', session.refreshed.expires_at)
    }
    return { id: userId, session }
}
