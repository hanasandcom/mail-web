import { requireMailAdminConfig, mailConfig } from './config.ts'
import { ADMIN_TIMEOUT_MS, basicAuthorizationHeader, ensureTrailingSlash } from './stalwartAdminRequest.ts'
import type { JmapResponse, JmapSession } from './stalwartAdminTypes.ts'

const CORE_CAPABILITY = 'urn:ietf:params:jmap:core'
const STALWART_CAPABILITY = 'urn:stalwart:jmap'

export async function jmapAdminCall<T = unknown>(methodName: string, args: Record<string, unknown>) {
    const config = requireMailAdminConfig()
    const payload = {
        using: [CORE_CAPABILITY, STALWART_CAPABILITY],
        methodCalls: [[methodName, args, 'admin']] as Array<[string, Record<string, unknown>, string]>,
    }
    let lastError: Error | null = null

    for (const endpoint of await adminJmapEndpoints()) {
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    Authorization: basicAuthorizationHeader(config),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(ADMIN_TIMEOUT_MS),
            })
            const body = await response.text()
            if (!response.ok) {
                throw new Error(`Stalwart JMAP admin request failed (${response.status}) for ${methodName}`)
            }

            const parsed = JSON.parse(body) as JmapResponse<T | { type?: string, description?: string }>
            const methodResponse = parsed.methodResponses?.[0]
            if (!methodResponse) {
                throw new Error(`Stalwart JMAP admin request returned no response for ${methodName}`)
            }
            if (methodResponse[0] === 'error') {
                const details = methodResponse[1] as { type?: string, description?: string }
                throw new Error(`Stalwart JMAP admin request failed (${details.type || 'error'}) for ${methodName}: ${details.description || 'No details'}`)
            }
            const result = methodResponse[1] as Record<string, unknown>
            if (result.notCreated || result.notUpdated || result.notDestroyed) {
                throw new Error(`Stalwart JMAP admin request failed for ${methodName}: ${JSON.stringify({
                    notCreated: result.notCreated,
                    notUpdated: result.notUpdated,
                    notDestroyed: result.notDestroyed,
                })}`)
            }
            return methodResponse[1] as T
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error))
        }
    }
    throw lastError || new Error(`Stalwart JMAP admin request failed for ${methodName}`)
}

async function adminJmapEndpoints() {
    const endpoints = [
        new URL('/api', ensureTrailingSlash(mailConfig.internalUrl)).toString(),
        new URL('/jmap', ensureTrailingSlash(mailConfig.internalUrl)).toString(),
        new URL('/jmap/', ensureTrailingSlash(mailConfig.internalUrl)).toString(),
    ]

    try {
        const config = requireMailAdminConfig()
        const response = await fetch(new URL('/jmap/session', ensureTrailingSlash(mailConfig.internalUrl)), {
            headers: {
                Accept: 'application/json',
                Authorization: basicAuthorizationHeader(config),
            },
            signal: AbortSignal.timeout(ADMIN_TIMEOUT_MS),
        })
        if (response.ok) {
            const session = await response.json() as JmapSession
            if (session.apiUrl) endpoints.unshift(toInternalUrl(session.apiUrl))
        }
    } catch {
        // Newer Stalwart still accepts management JMAP calls directly on /api.
    }

    return [...new Set(endpoints)]
}

function toInternalUrl(value: string) {
    try {
        const url = new URL(value)
        const internal = new URL(mailConfig.internalUrl)
        url.protocol = internal.protocol
        url.host = internal.host
        return url.toString()
    } catch {
        return new URL('/api', ensureTrailingSlash(mailConfig.internalUrl)).toString()
    }
}
