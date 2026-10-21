export type MailAddress = {
    email: string
    name?: string
}

export type MailAttachment = {
    blobId: string
    name: string
    type: string
    size: number
    disposition?: string
    cid?: string | null
    isInline?: boolean
}

export type MailMessageSummary = {
    id: string
    threadId?: string
    mailboxIds: string[]
    subject: string
    preview: string
    receivedAt: string
    sentAt: string
    from: MailAddress[]
    to: MailAddress[]
    cc: MailAddress[]
    hasAttachment: boolean
    isRead: boolean
    isFlagged: boolean
    isAnswered: boolean
    isDraft: boolean
    isJunk: boolean
    isDeleted: boolean
}

export type MailMessage = MailMessageSummary & {
    replyTo: MailAddress[]
    bcc: MailAddress[]
    attachments: MailAttachment[]
    textBody: string
    htmlBody: string
}

export type MailboxItem = {
    id: string
    name: string
    role?: string
    parentId?: string | null
    sortOrder?: number
    unreadEmails?: number
    totalEmails?: number
}

export type MailRule = {
    id: number
    user_id: string
    name: string
    enabled: boolean
    criteria: {
        field: 'from' | 'subject' | 'body' | 'senderDomain'
        contains: string
    }
    action: {
        type: 'move'
        mailboxName: string
        markRead?: boolean
    }
    created_at: string
    updated_at: string
}

export type MailHealthCheck = {
    id: string
    label: string
    status: 'healthy' | 'warning' | 'error'
    detail: string
}

export type MailHealth = {
    status: 'healthy' | 'warning' | 'error'
    checkedAt: string
    queueDepth: number
    smtpBannerLatencyMs: number | null
    checks: MailHealthCheck[]
}

export type RecentMailRecipient = {
    email: string
    name?: string
    useCount: number
    lastUsedAt: string
}

export type MailOverview = {
    actor: {
        id: string
        canAccessAnyMailbox: boolean
    }
    mailboxUser: string
    mailboxAddress: string
    accessibleAccounts: Array<{ id: string, name: string, address: string }>
    mailboxes: MailboxItem[]
    selectedMailboxId: string | null
    messages: MailMessageSummary[]
    selectedMessage: MailMessage | null
    filters: MailRule[]
    recentRecipients: RecentMailRecipient[]
    health: MailHealth | null
    settings: {
        host: string
        imapHost: string
        imapPort: number
        smtpHost: string
        smtpPort: number
        managesievePort: number
        username: string
        address: string
    }
}
