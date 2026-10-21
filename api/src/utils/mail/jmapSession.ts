import { mailConfig } from './config.ts'
import type { JmapSession } from './jmapTypes.ts'

const CORE = 'urn:ietf:params:jmap:core'
const MAIL = 'urn:ietf:params:jmap:mail'
export const JMAP_TIMEOUT_MS = Number(process.env.MAIL_JMAP_TIMEOUT_MS || 8000)

export async function getMailSession(username: string, password: string) {
    const response = await fetchJmap(new URL('/jmap/session', ensureTrailingSlash(mailConfig.internalUrl)), {
        headers: authHeaders(username, password),
        cache: 'no-store',
    }, true)

    if (!response.ok) {
        throw new Error(`Unable to reach mail session endpoint: ${response.status}`)
    }

    const session = await response.json() as JmapSession
    const accountId = session.primaryAccounts?.[MAIL]
    if (!accountId) {
        throw new Error('No primary mail account available.')
    }

    return { session, accountId }
}

export async function jmapCall<T = unknown>(username: string, password: string, session: JmapSession, methodCalls: Array<[string, Record<string, unknown>, string]>, using: string[] = [CORE, MAIL]) {
    const retryable = methodCalls.every(([method]) => ['Mailbox/get', 'Email/query', 'Email/get'].includes(method))
    const response = await fetchJmap(toMailServiceUrl(session.apiUrl), {
        method: 'POST',
        headers: {
            ...authHeaders(username, password),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ using, methodCalls }),
    }, retryable)

    if (!response.ok) {
        throw new Error(`JMAP request failed (${response.status}).`)
    }

    const payload = await response.json() as { methodResponses?: Array<[string, T, string]> }
    const result = payload.methodResponses?.[payload.methodResponses.length - 1]
    if (!result || result[0] === 'error') throw new Error('Mail request failed. Please retry.')
    return result[1] as T
}

async function fetchJmap(input: RequestInfo | URL, init: RequestInit, retryable: boolean) {
    for (let attempt = 0; ; attempt++) {
        try {
            return await fetch(input, { ...init, signal: AbortSignal.timeout(JMAP_TIMEOUT_MS) })
        } catch (error) {
            if (!retryable || attempt > 0 || !isTransientConnectionError(error)) throw error
        }
    }
}

function isTransientConnectionError(error: unknown): boolean {
    if (!(error instanceof Error)) return false
    if (/socket connection was closed unexpectedly|socket hang up|ECONNRESET|fetch failed|connection reset by peer/i.test(error.message)) return true
    return isTransientConnectionError(error.cause)
}

export function toMailServiceUrl(apiUrl: string) {
    try {
        const url = new URL(apiUrl)
        url.protocol = new URL(mailConfig.internalUrl).protocol
        url.host = new URL(mailConfig.internalUrl).host
        return url.toString()
    } catch {
        return new URL('/jmap/', ensureTrailingSlash(mailConfig.internalUrl)).toString()
    }
}

export function authHeaders(username: string, password: string) {
    return {
        Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
        Accept: 'application/json',
    }
}

function ensureTrailingSlash(value: string) {
    return value.endsWith('/') ? value : `${value}/`
}
