import type { MailDraftAttachment, MailUiApi } from '../api'
import type { MailAddress, MailMessage, MailOverview } from '../types'
import { formatDate } from './mailFormatting'

export type ComposerMode = 'new' | 'reply' | 'replyAll' | 'forward'

export type ComposerState = {
    open: boolean
    mode: ComposerMode
    to: string
    cc: string
    bcc: string
    subject: string
    body: string
    attachments: MailDraftAttachment[]
}
export const emptyComposer: ComposerState = {
    open: false,
    mode: 'new',
    to: '',
    cc: '',
    bcc: '',
    subject: '',
    body: '',
    attachments: [],
}

export function composeFromReply(mode: ComposerMode, message: MailMessage, ownAddress?: string): ComposerState {
    const subject = mode === 'forward'
        ? prefixSubject(message.subject, 'Fwd:')
        : prefixSubject(message.subject, 'Re:')

    const recipients = mode === 'reply'
        ? message.replyTo.length ? message.replyTo : message.from
        : mode === 'replyAll'
            ? dedupeAddresses(
                [...(message.replyTo.length ? message.replyTo : message.from), ...message.to, ...message.cc]
                    .filter((address) => address.email.toLowerCase() !== (ownAddress || '').toLowerCase())
            )
            : []

    const quoted = `\n\nOn ${formatDate(message.receivedAt, true)}, ${message.from.map((from) => from.email).join(', ')} wrote:\n${message.textBody.split('\n').map((line) => `> ${line}`).join('\n')}`

    return {
        open: true,
        mode,
        to: recipients.map((address) => address.email).join(', '),
        cc: '',
        bcc: '',
        subject,
        body: mode === 'forward' ? `\n\n---------- Forwarded message ----------\n${message.textBody}` : quoted,
        attachments: [],
    }
}

export function prefixSubject(subject: string, prefix: string) {
    return subject.toLowerCase().startsWith(prefix.toLowerCase()) ? subject : `${prefix} ${subject}`
}

export function dedupeAddresses(addresses: MailAddress[]) {
    const seen = new Set<string>()
    return addresses.filter((address) => {
        const key = address.email.toLowerCase()
        if (seen.has(key)) {
            return false
        }
        seen.add(key)
        return true
    })
}

export async function runAction(
    api: MailUiApi,
    messageId: string,
    overview: MailOverview,
    setError: (value: string) => void,
    load: (params?: {
        mailboxId?: string | null
        messageId?: string | null
        mailboxUser?: string | null
        silent?: boolean
    }) => Promise<void>,
    action: 'read' | 'unread' | 'flag' | 'unflag' | 'archive' | 'junk' | 'ham' | 'trash' | 'restore',
) {
    try {
        await api.messageAction(messageId, { mailboxUser: overview.mailboxUser, action })
        await load(['archive', 'trash', 'junk', 'ham', 'restore'].includes(action)
            ? { silent: true, messageId: null }
            : { silent: true })
        return true
    } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to update message.')
        return false
    }
}
