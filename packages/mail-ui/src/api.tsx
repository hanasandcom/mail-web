'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type {
    MailAttachmentReputation,
    MailMessage,
    MailOverview,
    MailRemoteUrl,
    MailRule,
    RecentMailRecipient,
} from './types'

export type MailDraftAttachment = {
    name: string
    type: string
    contentBase64: string
    size: number
}

export type MailRemoteContent = {
    remoteUrls: MailRemoteUrl[]
    attachments: MailAttachmentReputation[]
}

export interface MailUiApi {
    fetchMailOverview(params?: { mailboxUser?: string, mailboxId?: string | null, messageId?: string | null, after?: string }): Promise<MailOverview>
    searchMail(params: { mailboxUser: string, mailboxId: string, query: string, after?: string }): Promise<{ messages: MailOverview['messages'], nextCursor: string | null }>
    fetchMailRemoteContent(params: { mailboxUser: string, messageId: string }): Promise<MailRemoteContent>
    sendMail(body: { mailboxUser?: string, to: string, cc?: string, bcc?: string, replyTo?: string, subject: string, textBody: string, htmlBody?: string, attachments?: MailDraftAttachment[] }, idempotencyKey: string): Promise<{ ok: boolean, mailboxUser: string, sentMailboxId: string | null, sentMessageId: string | null } | null>
    messageAction(messageId: string, body: { mailboxUser?: string, action: 'read' | 'unread' | 'flag' | 'unflag' | 'archive' | 'junk' | 'ham' | 'trash' | 'restore' | 'move', targetMailboxId?: string, targetMailboxName?: string }): Promise<unknown>
    createMailbox(body: { mailboxUser?: string, name: string, parentId?: string | null }): Promise<unknown>
    createFilter(body: { mailboxUser?: string, name: string, enabled?: boolean, criteria: { field: 'from' | 'subject' | 'body' | 'senderDomain', contains: string }, action: { type: 'move', mailboxName: string, markRead?: boolean } }): Promise<MailRule | unknown>
    deleteFilter(id: number, mailboxUser?: string): Promise<void>
    fetchMailBlob(mailboxUser: string, blobId: string, name: string, signal?: AbortSignal): Promise<Response>
}

const MailUiApiContext = createContext<MailUiApi | null>(null)

export function MailUiApiProvider({ api, children }: { api: MailUiApi, children: ReactNode }) {
    return <MailUiApiContext.Provider value={api}>{children}</MailUiApiContext.Provider>
}

export function useMailUiApi() {
    const api = useContext(MailUiApiContext)
    if (!api) throw new Error('MailUiApiProvider is required.')
    return api
}

export type { MailMessage, RecentMailRecipient }
