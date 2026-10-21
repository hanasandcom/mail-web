import { getMailAccess, rotateMailPasswordForUser } from '#utils/mail/accounts.ts'
import { listMailRules, scheduleMailRules } from '#utils/mail/filters.ts'
import type { getMailHealth } from '#utils/mail/health.ts'
import { getMailboxList, getMessage, listMessagePage } from '#utils/mail/jmap.ts'
import { mailConfig } from '#utils/mail/config.ts'
import { listAccessibleMailAccounts } from '#utils/mail/accounts.ts'
import { listRecentRecipients } from '#utils/mail/recentRecipients.ts'

type MailAccess = Awaited<ReturnType<typeof getMailAccess>>

export async function loadMailboxOverviewData({
    actorId,
    access,
    query,
    health,
    accessibleAccounts,
    recentRecipients,
    onRepair,
    onRulesError,
}: {
    actorId: string
    access: MailAccess
    query: { mailboxUser?: string, mailboxId?: string, messageId?: string, after?: string }
    health: Awaited<ReturnType<typeof getMailHealth>> | null
    accessibleAccounts: Awaited<ReturnType<typeof listAccessibleMailAccounts>>
    recentRecipients: Awaited<ReturnType<typeof listRecentRecipients>>
    onRepair: (error: Error) => void
    onRulesError: (error: Error) => void
}) {
    const { access: repairedAccess, mailboxData } = await repairMailAccessIfNeeded(access, onRepair)
    const inboxMailbox = mailboxData.mailboxes.find(mailbox => mailbox.role === 'inbox') || mailboxData.mailboxes[0]
    if (!inboxMailbox) {
        return emptyMailboxOverview(actorId, access, repairedAccess, accessibleAccounts, recentRecipients, health)
    }

    scheduleMailRules({
        userId: repairedAccess.targetUser,
        username: repairedAccess.username,
        password: repairedAccess.password,
        inboxMailboxId: inboxMailbox.id,
        junkMailboxId: mailboxData.mailboxes.find(mailbox => mailbox.role === 'junk')?.id || null,
        mailboxAddress: repairedAccess.address,
    }, onRulesError)

    const selectedMailboxId = query.mailboxId
        || mailboxData.mailboxes.find(mailbox => mailbox.role === (access.targetUser === 'shared:noreply' ? 'sent' : 'inbox'))?.id
        || mailboxData.mailboxes[0]?.id
        || null
    const page = selectedMailboxId ? await listMessagePage(repairedAccess.username, repairedAccess.password, selectedMailboxId, query.after) : { messages: [], nextCursor: null }
    const messages = page.messages
    const selectedMessageId = query.messageId || messages[0]?.id
    const selectedMessage = selectedMessageId ? await getMessage(repairedAccess.username, repairedAccess.password, selectedMessageId) : null
    const filters = await listMailRules(repairedAccess.targetUser)

    return {
        actor: { id: actorId, canAccessAnyMailbox: repairedAccess.canAccessAnyMailbox, canSend: repairedAccess.canSend },
        mailboxUser: repairedAccess.targetUser,
        mailboxAddress: repairedAccess.address,
        accessibleAccounts,
        mailboxes: mailboxData.mailboxes,
        selectedMailboxId,
        messages,
        nextCursor: page.nextCursor,
        selectedMessage,
        filters,
        recentRecipients,
        health,
        settings: settingsFor(repairedAccess),
    }
}

function emptyMailboxOverview(
    actorId: string,
    originalAccess: MailAccess,
    access: MailAccess,
    accessibleAccounts: Awaited<ReturnType<typeof listAccessibleMailAccounts>>,
    recentRecipients: Awaited<ReturnType<typeof listRecentRecipients>>,
    health: Awaited<ReturnType<typeof getMailHealth>> | null,
) {
    return {
        actor: { id: actorId, canAccessAnyMailbox: originalAccess.canAccessAnyMailbox, canSend: originalAccess.canSend },
        mailboxUser: access.targetUser,
        mailboxAddress: access.address,
        accessibleAccounts,
        mailboxes: [],
        selectedMailboxId: null,
        messages: [],
        selectedMessage: null,
        filters: [],
        recentRecipients,
        health,
        settings: settingsFor(access),
    }
}

async function repairMailAccessIfNeeded(access: MailAccess, onRepair: (error: Error) => void) {
    try {
        const mailboxData = await getMailboxList(access.username, access.password)
        return { access, mailboxData }
    } catch (error) {
        if (!isMailAuthError(error)) throw error
        onRepair(error as Error)
        if (access.targetUser.startsWith('shared:')) throw error
        const repaired = await rotateMailPasswordForUser(access.targetUser, access.targetUser)
        const repairedAccess = { ...access, username: repaired.username, address: repaired.address, password: repaired.password }
        return { access: repairedAccess, mailboxData: await getMailboxList(repairedAccess.username, repairedAccess.password) }
    }
}

function isMailAuthError(error: unknown) {
    return error instanceof Error && /\b401\b/.test(error.message)
}

export function settingsFor(access: { username: string, address: string }) {
    return {
        host: mailConfig.host,
        imapHost: mailConfig.host,
        imapPort: mailConfig.imapPort,
        smtpHost: mailConfig.host,
        smtpPort: mailConfig.smtpPort,
        managesievePort: mailConfig.managesievePort,
        username: access.username,
        address: access.address,
    }
}
