import type { MailAddress, MailboxItem } from './types.ts'

export type JmapSession = {
    apiUrl: string
    downloadUrl: string
    uploadUrl: string
    primaryAccounts?: Record<string, string>
}

export type MailboxRecord = MailboxItem & {
    myRights?: Record<string, boolean>
}

export type EmailRecord = {
    id: string
    threadId?: string
    mailboxIds?: Record<string, boolean>
    keywords?: Record<string, boolean>
    subject?: string
    preview?: string
    receivedAt?: string
    sentAt?: string
    from?: MailAddress[]
    to?: MailAddress[]
    cc?: MailAddress[]
    bcc?: MailAddress[]
    replyTo?: MailAddress[]
    hasAttachment?: boolean
    attachments?: Array<{
        blobId: string
        name?: string
        type?: string
        size?: number
        disposition?: string
        cid?: string | null
    }>
    textBody?: Array<{ partId?: string }>
    htmlBody?: Array<{ partId?: string }>
    bodyValues?: Record<string, { value?: string }>
}
