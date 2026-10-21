import { getCookie } from '../cookies/cookies'
import type { MailOverview } from './types'

export function normalizeMailOverview(payload: Partial<MailOverview>): MailOverview {
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
