'use client'

import { authHeaders, fetchWithTimeout, mailApiUrl, postJson } from './client.transport'

export type DraftAttachment = { name: string, type: string, size: number, contentBase64: string }

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
}, idempotencyKey = crypto.randomUUID()) {
    return postJson('/mail/send', body, { 'Idempotency-Key': idempotencyKey }) as Promise<{
        ok: boolean
        mailboxUser: string
        sentMailboxId: string | null
        sentMessageId: string | null
    } | null>
}

export function createMailbox(body: { mailboxUser?: string, name: string, parentId?: string | null }) {
    return postJson('/mail/mailboxes', body)
}

export function createFilter(body: {
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
    if (!headers) throw new Error('Unauthorized.')
    const search = mailboxUser ? `?mailboxUser=${encodeURIComponent(mailboxUser)}` : ''
    const response = await fetchWithTimeout(mailApiUrl(`/mail/filters/${id}${search}`), { method: 'DELETE', headers }, 15_000)
    if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(payload.error || 'Unable to delete filter.')
    }
}

export function messageAction(messageId: string, body: {
    mailboxUser?: string
    action: 'read' | 'unread' | 'flag' | 'unflag' | 'archive' | 'junk' | 'ham' | 'trash' | 'restore' | 'move'
    targetMailboxId?: string
    targetMailboxName?: string
}) {
    return postJson(`/mail/message/${encodeURIComponent(messageId)}/action`, body)
}
