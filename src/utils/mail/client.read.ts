'use client'

import type { MailAttachmentReputation, MailOverview, MailRemoteUrl } from './types'
import { authHeaders, fetchWithTimeout, mailApiUrl } from './client.transport'
import { normalizeMailOverview } from './client.normalize'

export async function fetchMailOverview(params: { mailboxUser?: string, mailboxId?: string | null, messageId?: string | null, after?: string } = {}) {
    const headers = authHeaders()
    if (!headers) throw new Error('Unauthorized.')
    const search = new URLSearchParams()
    if (params.mailboxUser) search.set('mailboxUser', params.mailboxUser)
    if (params.mailboxId) search.set('mailboxId', params.mailboxId)
    if (params.messageId) search.set('messageId', params.messageId)
    if (params.after) search.set('after', params.after)
    const response = await fetchWithTimeout(mailApiUrl(`/mail/overview?${search}`), { headers }, 15_000)
    const payload = await response.json().catch(() => ({})) as Partial<MailOverview> & { error?: string }
    if (!response.ok) throw new Error(payload.error || 'Mail is unavailable right now.')
    return normalizeMailOverview(payload)
}

export async function searchMail(params: { mailboxUser: string, mailboxId: string, query: string, after?: string }) {
    const headers = authHeaders()
    if (!headers) throw new Error('Unauthorized.')
    const search = new URLSearchParams({ mailboxUser: params.mailboxUser, mailboxId: params.mailboxId, query: params.query })
    if (params.after) search.set('after', params.after)
    const response = await fetchWithTimeout(mailApiUrl(`/mail/search?${search}`), { headers }, 15_000)
    const payload = await response.json().catch(() => ({})) as { error?: string, messages?: MailOverview['messages'], nextCursor?: string | null }
    if (!response.ok) throw new Error(payload.error || 'Unable to search this mailbox.')
    return { messages: Array.isArray(payload.messages) ? payload.messages : [], nextCursor: payload.nextCursor || null }
}

export async function fetchMailRemoteContent(params: { mailboxUser: string, messageId: string }) {
    const headers = authHeaders()
    if (!headers) throw new Error('Unauthorized.')
    const query = new URLSearchParams({ mailboxUser: params.mailboxUser })
    const response = await fetchWithTimeout(mailApiUrl(`/mail/message/${encodeURIComponent(params.messageId)}/reputation?${query}`), { headers }, 15_000)
    const payload = await response.json().catch(() => ({})) as { error?: string, messageId?: string, remoteUrls?: MailRemoteUrl[], attachments?: MailAttachmentReputation[] }
    if (!response.ok) throw new Error(payload.error || 'Unable to check remote email images.')
    if (payload.messageId !== params.messageId || !Array.isArray(payload.remoteUrls)) throw new Error('Remote email image status is unavailable.')
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
    const attachments = Array.isArray(payload.attachments) ? payload.attachments.filter(item => Boolean(item?.blobId && item.reputation?.provider === 'virustotal')) : []
    return { remoteUrls, attachments }
}

export async function fetchHasUnreadMail() {
    const headers = authHeaders()
    if (!headers) throw new Error('Unauthorized.')
    const response = await fetchWithTimeout(mailApiUrl('/mail/overview?unreadOnly=true'), { headers }, 7_000)
    const payload = await response.json().catch(() => null) as { error?: string, accessibleAccounts?: Array<{ unreadCount?: number | null }> } | null
    if (!response.ok) throw new Error(payload?.error || 'Mail is unavailable right now.')
    return Array.isArray(payload?.accessibleAccounts) && payload.accessibleAccounts.some(account => (account.unreadCount ?? 0) > 0)
}

function canonicalRemoteUrl(value: string) {
    try {
        const url = new URL(value)
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
        url.hash = ''
        return url.href
    } catch { return null }
}
