import { requireMailAdminConfig, mailConfig } from './config.ts'

export const ADMIN_TIMEOUT_MS = Number(process.env.MAIL_ADMIN_TIMEOUT_MS || 8000)

export async function adminFetch(path: string, init: RequestInit = {}) {
    const config = requireMailAdminConfig()
    const headers = new Headers(init.headers)
    headers.set('Accept', 'application/json')
    headers.set('Authorization', basicAuthorizationHeader(config))

    const response = await fetch(new URL(path, ensureTrailingSlash(mailConfig.internalUrl)), {
        ...init,
        headers,
        signal: init.signal || AbortSignal.timeout(ADMIN_TIMEOUT_MS),
    })
    const body = await response.text()
    if (!response.ok) {
        throw new Error(`Stalwart admin request failed (${response.status}) for ${path}`)
    }
    if (!body) return response

    const payload = JSON.parse(body) as { error?: string, details?: string, reason?: string, item?: string }
    if (payload.error) {
        throw new Error(`Stalwart admin request failed (${payload.error}) for ${path}: ${payload.details || payload.reason || payload.item || 'No details'}`)
    }
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
}

export function basicAuthorizationHeader(config: ReturnType<typeof requireMailAdminConfig>) {
    return `Basic ${Buffer.from(`${config.adminUser}:${config.adminPassword}`).toString('base64')}`
}

export function isLegacyAdminRouteMissing(error: unknown) {
    return error instanceof Error && (
        error.message.includes('Stalwart admin request failed (404)')
        || error.message.includes('Stalwart admin request failed (400) for /api/settings')
        || error.message.includes('notFound')
        || error.message.includes('socket connection was closed unexpectedly')
        || error.message.includes('Unable to connect')
        || error.message.includes('ECONNRESET')
    )
}

export function isMissingRequiredSystemSettings(error: unknown) {
    return error instanceof Error && (
        error.message.includes('invalidProperties')
        || error.message.includes('defaultDomainId')
        || error.message.includes('Stalwart JMAP admin request failed (400) for x:SystemSettings/set')
    )
}

export function ensureTrailingSlash(value: string) {
    return value.endsWith('/') ? value : `${value}/`
}
