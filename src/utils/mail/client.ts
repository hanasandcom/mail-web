'use client'

import { getCookie, setCookieWithExpiresAt } from '@/utils/cookies/cookies'
import type { MailAttachmentReputation, MailOverview, MailRemoteUrl } from './types'

const MAIL_API_BASE = (process.env.NEXT_PUBLIC_MAIL_API_BASE || '/api/backend').replace(/\/+$/, '')

function mailApiUrl(path: string) {
    return `${MAIL_API_BASE}${path}`
}

export type DraftAttachment = {
    name: string
    type: string
    contentBase64: string
    size: number
}

function authHeaders() {
    const token = getCookie('access_token')
    const id = getCookie('id')

    if (!token || !id) {
        return null
    }

    return {
        'Content-Type': 'application/json',
        id,
        Authorization: `Bearer ${token}`,
    }
}

export async function fetchMailOverview(params: { mailboxUser?: string, mailboxId?: string | null, messageId?: string | null, after?: string } = {}) {
    const headers = authHeaders()
    if (!headers) {
        throw new Error('Unauthorized.')
    }

    const search = new URLSearchParams()
    if (params.mailboxUser) {
        search.set('mailboxUser', params.mailboxUser)
    }
    if (params.mailboxId) {
        search.set('mailboxId', params.mailboxId)
    }
    if (params.messageId) {
        search.set('messageId', params.messageId)
    }

    if (params.after) search.set('after', params.after)

    const response = await fetchWithTimeout(mailApiUrl(`/mail/overview?${search.toString()}`), {
        headers,
        cache: 'no-store',
    }, 15_000)
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
        throw new Error((payload as { error?: string }).error || 'Mail is unavailable right now. The rest of the console is still ready.')
    }

    return normalizeMailOverview(payload as Partial<MailOverview>)
}

export async function searchMail(params: { mailboxUser: string, mailboxId: string, query: string, after?: string }) {
    const headers = authHeaders()
    if (!headers) {
        throw new Error('Unauthorized.')
    }

    const search = new URLSearchParams({ mailboxUser: params.mailboxUser, mailboxId: params.mailboxId, query: params.query })
    if (params.after) search.set('after', params.after)

    const response = await fetchWithTimeout(mailApiUrl(`/mail/search?${search.toString()}`), {
        headers,
        cache: 'no-store',
    }, 15_000)
    const payload = await response.json().catch(() => ({})) as { error?: string, messages?: MailOverview['messages'], nextCursor?: string | null }
    if (!response.ok) {
        throw new Error(payload.error || 'Unable to search this mailbox.')
    }

    return {
        messages: Array.isArray(payload.messages) ? payload.messages : [],
        nextCursor: payload.nextCursor || null,
    }
}

export async function fetchMailRemoteContent(params: { mailboxUser: string, messageId: string }) {
    const headers = authHeaders()
    if (!headers) throw new Error('Unauthorized.')

    const search = new URLSearchParams({ mailboxUser: params.mailboxUser })
    const response = await fetchWithTimeout(mailApiUrl(`/mail/message/${encodeURIComponent(params.messageId)}/reputation?${search.toString()}`), {
        headers,
        cache: 'no-store',
    }, 15_000)
    const payload = await response.json().catch(() => ({})) as { error?: string, messageId?: string, remoteUrls?: MailRemoteUrl[], attachments?: MailAttachmentReputation[] }
    if (!response.ok) throw new Error(payload.error || 'Unable to check remote email images.')
    if (payload.messageId !== params.messageId || !Array.isArray(payload.remoteUrls)) {
        throw new Error('Remote email image status is unavailable.')
    }

    const checked = await Promise.all(payload.remoteUrls.map(async item => {
        if (!item?.id || !item.url || item.reputation?.provider !== 'virustotal') return null
        const canonical = canonicalRemoteUrl(item.url)
        if (!canonical || canonical !== item.url) return null
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)).catch(() => null)
        if (!digest) return null
        const id = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
        return id === item.id ? item : null
    }))
    const remoteUrls = checked.filter((item): item is MailRemoteUrl => item !== null)
    const attachments = Array.isArray(payload.attachments) ? payload.attachments.filter(item => Boolean(item?.blobId && item?.reputation?.provider === 'virustotal')) : []
    return { remoteUrls, attachments }
}

function canonicalRemoteUrl(value: string) {
    try {
        const url = new URL(value)
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
        url.hash = ''
        return url.href
    } catch {
        return null
    }
}

export async function fetchHasUnreadMail() {
    const headers = authHeaders()
    if (!headers) {
        throw new Error('Unauthorized.')
    }

    const response = await fetchWithTimeout(mailApiUrl('/mail/overview?unreadOnly=true'), {
        headers,
        cache: 'no-store',
    }, 7_000)
    const payload = await response.json().catch(() => ({})) as { error?: string, accessibleAccounts?: Array<{ unreadCount?: number | null }> } | null
    if (!response.ok) {
        throw new Error(payload?.error || 'Mail is unavailable right now.')
    }

    return Array.isArray(payload?.accessibleAccounts) && payload.accessibleAccounts.some(account => (account.unreadCount ?? 0) > 0)
}

export async function sendMail(body: {
    mailboxUser?: string
    to: string
    cc?: string
    bcc?: string
    replyTo?: string
    subject: string
    textBody: string
    htmlBody?: string
    attachments?: DraftAttachment[]
}, idempotencyKey: string) {
    return postJson('/mail/send', body, { 'Idempotency-Key': idempotencyKey }) as Promise<{
        ok: boolean
        mailboxUser: string
        sentMailboxId: string | null
        sentMessageId: string | null
    } | null>
}

export async function createMailbox(body: { mailboxUser?: string, name: string, parentId?: string | null }) {
    return postJson('/mail/mailboxes', body)
}

export async function createFilter(body: {
    mailboxUser?: string
    name: string
    enabled?: boolean
    criteria: { field: 'from' | 'subject' | 'body' | 'senderDomain', contains: string }
    action: { type: 'move', mailboxName: string, markRead?: boolean }
}) {
    return postJson('/mail/filters', body)
}

export async function deleteFilter(id: number, mailboxUser?: string) {
    const headers = authHeaders()
    if (!headers) {
        throw new Error('Unauthorized.')
    }

    const search = mailboxUser ? `?mailboxUser=${encodeURIComponent(mailboxUser)}` : ''
    const response = await fetchWithTimeout(mailApiUrl(`/mail/filters/${id}${search}`), { method: 'DELETE', headers }, 15_000)
    if (!response.ok) {
        redirectForReauthentication(response)
        const payload = await response.json().catch(() => ({}))
        throw new Error((payload as { error?: string }).error || 'Unable to delete filter.')
    }
}

export async function messageAction(messageId: string, body: {
    mailboxUser?: string
    action: 'read' | 'unread' | 'flag' | 'unflag' | 'archive' | 'junk' | 'ham' | 'trash' | 'restore' | 'move'
    targetMailboxId?: string
    targetMailboxName?: string
}) {
    return postJson(`/mail/message/${messageId}/action`, body)
}

export async function fetchMailBlob(mailboxUser: string, blobId: string, name: string, signal?: AbortSignal) {
    const headers = authHeaders()
    if (!headers) throw new Error('Unauthorized.')

    const path = `/mail/blob/${encodeURIComponent(mailboxUser)}/${encodeURIComponent(blobId)}/${encodeURIComponent(name)}`
    const response = await fetchWithTimeout(mailApiUrl(path), { headers, cache: 'no-store', signal }, 20_000)
    if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(payload.error || 'Unable to load this attachment.')
    }
    return response
}

async function postJson(path: string, body: Record<string, unknown>, extraHeaders: Record<string, string> = {}) {
    const headers = authHeaders()
    if (!headers) {
        throw new Error('Unauthorized.')
    }

    const response = await fetchWithTimeout(mailApiUrl(path), {
        method: 'POST',
        headers: { ...headers, ...extraHeaders },
        body: JSON.stringify(body),
        cache: 'no-store',
    }, 15_000)

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
        redirectForReauthentication(response)
        throw new Error((payload as { error?: string } | null)?.error || 'Request failed.')
    }

    return payload
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
    const controller = new AbortController()
    const callerSignal = init.signal
    const abortForCaller = () => controller.abort(callerSignal?.reason)
    if (callerSignal?.aborted) abortForCaller()
    else callerSignal?.addEventListener('abort', abortForCaller, { once: true })
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
    try {
        const response = await fetch(input, { ...init, signal: controller.signal })
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
    if (!token) return
    setCookieWithExpiresAt('access_token', token, response.headers.get('x-access-token-expires-at'))
}

function normalizeMailOverview(payload: Partial<MailOverview>): MailOverview {
    const mailboxUser = payload.mailboxUser || getCookie('id') || ''
    const mailboxAddress = payload.mailboxAddress || (mailboxUser ? `${mailboxUser}@hanasand.com` : '')

    return {
        actor: {
            id: payload.actor?.id || getCookie('id') || mailboxUser,
            canAccessAnyMailbox: Boolean(payload.actor?.canAccessAnyMailbox),
            canSend: payload.actor?.canSend !== false,
        },
        mailboxUser,
        mailboxAddress,
        accessibleAccounts: payload.accessibleAccounts || [],
        mailboxes: payload.mailboxes || [],
        selectedMailboxId: payload.selectedMailboxId || null,
        messages: payload.messages || [],
        nextCursor: payload.nextCursor || null,
        selectedMessage: payload.selectedMessage || null,
        filters: payload.filters || [],
        recentRecipients: payload.recentRecipients || [],
        health: payload.health || null,
        settings: payload.settings || {
            host: '',
            imapHost: '',
            imapPort: 0,
            smtpHost: '',
            smtpPort: 0,
            managesievePort: 0,
            username: mailboxUser,
            address: mailboxAddress,
        },
    }
}

function redirectForReauthentication(response: Response) {
    if (response.status === 401 && typeof window !== 'undefined') {
        window.location.assign('https://hanasand.com/dashboard/mail')
    }
}
