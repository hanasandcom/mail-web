'use client'

import { getCookie, setCookieWithExpiresAt } from '../cookies/cookies'

const MAIL_API_BASE = (process.env.NEXT_PUBLIC_MAIL_API_BASE || '/api').replace(/\/+$/, '')

export function mailApiUrl(path: string) {
    return `${MAIL_API_BASE}${path}`
}

export function authHeaders() {
    const token = getCookie('access_token')
    const id = getCookie('id')
    if (!token || !id) return null
    return { 'Content-Type': 'application/json', id, Authorization: `Bearer ${token}` }
}

export async function request<T>(path: string, init: RequestInit) {
    const response = await fetchWithTimeout(mailApiUrl(path), init, 15_000)
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error((payload as { error?: string } | null)?.error || 'The mail request failed.')
    return payload as T
}

export async function postJson(path: string, body: Record<string, unknown>, extraHeaders: Record<string, string> = {}) {
    const headers = authHeaders()
    if (!headers) throw new Error('Unauthorized.')
    return request(path, {
        method: 'POST',
        headers: { ...headers, ...extraHeaders },
        body: JSON.stringify(body),
    })
}

export async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
    const controller = new AbortController()
    const callerSignal = init.signal
    const abortForCaller = () => controller.abort(callerSignal?.reason)
    if (callerSignal?.aborted) abortForCaller()
    else callerSignal?.addEventListener('abort', abortForCaller, { once: true })
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
    try {
        const response = await fetch(input, { ...init, cache: 'no-store', signal: controller.signal })
        refreshAccessToken(response)
        redirectForReauthentication(response)
        return response
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error('Mail did not respond in time. Message and folder actions are temporarily paused.', { cause: error })
        }
        throw error
    } finally {
        window.clearTimeout(timeout)
        callerSignal?.removeEventListener('abort', abortForCaller)
    }
}

function refreshAccessToken(response: Response) {
    const token = response.headers.get('x-access-token')
    if (token) setCookieWithExpiresAt('access_token', token, response.headers.get('x-access-token-expires-at'))
}

export function redirectForReauthentication(response: Response) {
    if (response.status === 401 && typeof window !== 'undefined') {
        window.location.assign('/?expired=true')
    }
}
