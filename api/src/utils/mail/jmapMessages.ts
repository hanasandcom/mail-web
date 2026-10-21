import type { MailAttachment, MailMessage, MailMessageSummary } from './types.ts'
import type { EmailRecord, JmapSession } from './jmapTypes.ts'
import { attributeContactSenders } from './contactSender.ts'
import { normalizeMessageText, stripHtml } from './helpers.ts'
import { getMailSession, jmapCall } from './jmapSession.ts'

export async function listMessages(username: string, password: string, mailboxId: string, limit = 50) {
    return (await listMessagePage(username, password, mailboxId, undefined, limit)).messages
}

export async function listMessagePage(username: string, password: string, mailboxId: string, after?: string, limit = 50) {
    return queryMessagePage(username, password, mailboxId, { inMailbox: mailboxId }, after, limit)
}

export async function searchMessagePage(username: string, password: string, mailboxId: string, text: string, after?: string, limit = 50) {
    return queryMessagePage(username, password, mailboxId, { inMailbox: mailboxId, text }, after, limit)
}

async function queryMessagePage(username: string, password: string, mailboxId: string, filter: Record<string, string>, after?: string, limit = 50) {
    const { session, accountId } = await getMailSession(username, password)
    const query = await jmapCall<{ ids?: string[] }>(username, password, session, [
        ['Email/query', { accountId, filter, sort: [{ property: 'receivedAt', isAscending: false }], limit: limit + 1,
            ...(after ? { anchor: after, anchorOffset: 1 } : {}) }, 'query']
    ])
    const ids = query.ids || []
    const pageIds = ids.slice(0, limit)
    const messages = pageIds.length ? await getEmailsByIds(username, password, session, accountId, pageIds) : []
    const byId = new Map(messages.map(message => [message.id, message]))
    return {
        messages: pageIds.flatMap(id => byId.has(id) ? [toSummary(byId.get(id)!)] : []),
        nextCursor: ids.length > limit ? pageIds.at(-1)! : null,
    }
}

export async function getMessage(username: string, password: string, messageId: string) {
    const { session, accountId } = await getMailSession(username, password)
    const messages = await getEmailsByIds(username, password, session, accountId, [messageId])
    return messages[0] ? toMessage(messages[0]) : null
}

export async function moveMessage(username: string, password: string, messageId: string, mailboxId: string, keywordPatch: Record<string, boolean | null> = {}) {
    const { session, accountId } = await getMailSession(username, password)
    await jmapCall(username, password, session, [
        ['Email/set', { accountId, update: { [messageId]: { mailboxIds: { [mailboxId]: true }, ...Object.fromEntries(Object.entries(keywordPatch).map(([key, value]) => [`keywords/${key}`, value])) } } }, 'move']
    ])
}

export async function patchMessageKeywords(username: string, password: string, messageId: string, keywords: Record<string, boolean | null>) {
    const { session, accountId } = await getMailSession(username, password)
    await jmapCall(username, password, session, [
        ['Email/set', { accountId, update: { [messageId]: Object.fromEntries(Object.entries(keywords).map(([key, value]) => [`keywords/${key}`, value])) } }, 'keywords']
    ])
}

export async function listInboxMessagesForFiltering(username: string, password: string, mailboxId: string) {
    return listMessages(username, password, mailboxId, 100)
}

async function getEmailsByIds(username: string, password: string, session: JmapSession, accountId: string, ids: string[]) {
    const response = await jmapCall<{ list?: EmailRecord[] }>(username, password, session, [
        ['Email/get', {
            accountId,
            ids,
            properties: ['id', 'threadId', 'mailboxIds', 'keywords', 'subject', 'preview', 'receivedAt', 'sentAt', 'from', 'to', 'cc', 'bcc', 'replyTo', 'hasAttachment', 'attachments', 'textBody', 'htmlBody', 'bodyValues'],
            fetchAllBodyValues: true,
        }, 'emails']
    ])

    const messages = response.list || []
    await attributeContactSenders(messages)
    return messages
}

function toSummary(record: EmailRecord): MailMessageSummary {
    const keywords = record.keywords || {}
    return {
        id: record.id,
        threadId: record.threadId,
        mailboxIds: Object.keys(record.mailboxIds || {}),
        subject: record.subject || '(No subject)',
        preview: record.preview || '',
        receivedAt: record.receivedAt || '',
        sentAt: record.sentAt || '',
        from: record.from || [],
        to: record.to || [],
        cc: record.cc || [],
        hasAttachment: Boolean(record.hasAttachment || record.attachments?.length),
        isRead: Boolean(keywords.$seen),
        isFlagged: Boolean(keywords.$flagged),
        isAnswered: Boolean(keywords.$answered),
        isDraft: Boolean(keywords.$draft),
        isJunk: Boolean(keywords.$junk),
        isDeleted: Boolean(keywords.$deleted),
    }
}

function toMessage(record: EmailRecord): MailMessage {
    const summary = toSummary(record)
    const attachments: MailAttachment[] = (record.attachments || []).map(attachment => ({
        blobId: attachment.blobId,
        name: attachment.name || 'attachment',
        type: attachment.type || 'application/octet-stream',
        size: attachment.size || 0,
        disposition: attachment.disposition,
        cid: attachment.cid || null,
        isInline: attachment.disposition === 'inline' || Boolean(attachment.cid),
    }))

    const htmlId = record.htmlBody?.[0]?.partId
    const textId = record.textBody?.[0]?.partId
    const htmlBody = htmlId ? record.bodyValues?.[htmlId]?.value || '' : ''
    const textBody = textId ? record.bodyValues?.[textId]?.value || '' : normalizeMessageText(stripHtml(htmlBody || record.preview || ''))

    return {
        ...summary,
        replyTo: record.replyTo || [],
        bcc: record.bcc || [],
        attachments,
        textBody: normalizeMessageText(textBody),
        htmlBody,
    }
}
