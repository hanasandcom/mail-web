import type { MailAddress } from './types.ts'
import { normalizeMessageText } from './helpers.ts'
import { ensureMailbox } from './jmapMailbox.ts'
import { getMailSession, jmapCall } from './jmapSession.ts'

export async function storeSentMessage(params: {
    username: string
    password: string
    from: MailAddress
    to: MailAddress[]
    cc?: MailAddress[]
    bcc?: MailAddress[]
    replyTo?: MailAddress[]
    subject: string
    textBody: string
    htmlBody?: string
    attachments?: Array<{ blobId: string, name: string, type: string, size: number }>
}) {
    const { username, password, from, to, cc = [], bcc = [], replyTo = [], subject, textBody, htmlBody, attachments = [] } = params
    const { session, accountId } = await getMailSession(username, password)

    const sentMailboxId = await ensureMailbox(username, password, 'Sent', 'sent')
    const createId = `sent-${Date.now()}`
    const bodyValues: Record<string, { value: string }> = {
        text: { value: normalizeMessageText(textBody || '') }
    }
    const create: Record<string, unknown> = {
        from: [from],
        to,
        cc,
        bcc,
        replyTo,
        subject,
        keywords: { '$seen': true },
        mailboxIds: sentMailboxId ? { [sentMailboxId]: true } : undefined,
        textBody: [{ partId: 'text', type: 'text/plain' }],
        bodyValues,
    }

    if (htmlBody) {
        bodyValues.html = { value: htmlBody }
        create.htmlBody = [{ partId: 'html', type: 'text/html' }]
    }

    if (attachments.length) {
        create.attachments = attachments.map(attachment => ({
            blobId: attachment.blobId,
            name: attachment.name,
            type: attachment.type,
            size: attachment.size,
            disposition: 'attachment',
        }))
    }

    const result = await jmapCall<{ created?: Record<string, { id: string }> }>(username, password, session, [
        ['Email/set', { accountId, create: { [createId]: create } }, 'email-create']
    ])

    return {
        sentMailboxId,
        sentMessageId: result.created?.[createId]?.id || null,
    }
}
