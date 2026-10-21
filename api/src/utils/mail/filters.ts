import run from '#db'
import { mailConfig } from './config.ts'
import { ensureMailbox, getMessage, listInboxMessagesForFiltering, moveMessage } from './jmap.ts'
import { type MailRule } from './types.ts'

export async function listMailRules(userId: string) {
    const response = await run(`SELECT * FROM ${filterTable(userId)} WHERE user_id = $1 ORDER BY priority ASC, id ASC`, [userId])
    return response.rows as MailRule[]
}

export async function createMailRule(userId: string, input: Omit<MailRule, 'id' | 'user_id' | 'created_at' | 'updated_at'>) {
    const response = await run(`
        INSERT INTO ${filterTable(userId)} (user_id, name, enabled, criteria, action, priority)
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, COALESCE((SELECT MAX(priority) + 1 FROM ${filterTable(userId)} WHERE user_id = $1), 1))
        RETURNING *
    `, [userId, input.name, input.enabled, JSON.stringify(input.criteria), JSON.stringify(input.action)])

    return response.rows[0] as MailRule
}

export async function deleteMailRule(userId: string, ruleId: string) {
    await run(`DELETE FROM ${filterTable(userId)} WHERE user_id = $1 AND id = $2`, [userId, ruleId])
}

export async function applyMailRules(params: {
    userId: string
    username: string
    password: string
    inboxMailboxId: string
    junkMailboxId?: string | null
    mailboxAddress: string
}) {
    if (params.junkMailboxId) {
        await promoteTrustedInternalMail(params)
    }

    const rules = await listMailRules(params.userId)
    const activeRules = rules.filter(rule => rule.enabled && rule.criteria.contains.trim())
    if (!activeRules.length) {
        return
    }

    const inboxMessages = await listInboxMessagesForFiltering(params.username, params.password, params.inboxMailboxId)
    for (const summary of inboxMessages) {
        const message = await getMessage(params.username, params.password, summary.id)
        if (!message) {
            continue
        }

        for (const rule of activeRules) {
            if (matchesRule(message, rule)) {
                const mailboxId = await ensureMailbox(params.username, params.password, rule.action.mailboxName)
                if (!mailboxId) {
                    continue
                }

                await moveMessage(
                    params.username,
                    params.password,
                    message.id,
                    mailboxId,
                    rule.action.markRead ? { '$seen': true } : {}
                )
                break
            }
        }
    }
}

type MailRuleRun = Parameters<typeof applyMailRules>[0]

export function createMailRuleScheduler(
    runRules: (params: MailRuleRun) => Promise<void>,
    intervalMs = 30_000,
    now: () => number = Date.now,
) {
    const scheduled = new Map<string, { startedAt: number, running: boolean }>()

    return (params: MailRuleRun, onError: (error: Error) => void) => {
        const currentTime = now()
        const previous = scheduled.get(params.userId)
        if (previous?.running || (previous && currentTime - previous.startedAt < intervalMs)) return

        const state = { startedAt: currentTime, running: true }
        scheduled.set(params.userId, state)
        void runRules(params).catch(error => onError(error as Error)).finally(() => { state.running = false })
    }
}

export const scheduleMailRules = createMailRuleScheduler(applyMailRules)

async function promoteTrustedInternalMail(params: {
    username: string
    password: string
    inboxMailboxId: string
    junkMailboxId?: string | null
    mailboxAddress: string
}) {
    if (!params.junkMailboxId) {
        return
    }

    const junkMessages = await listInboxMessagesForFiltering(params.username, params.password, params.junkMailboxId)
    for (const summary of junkMessages) {
        const message = await getMessage(params.username, params.password, summary.id)
        if (!message || !isTrustedInternalMail(message, params.mailboxAddress)) {
            continue
        }

        await moveMessage(params.username, params.password, message.id, params.inboxMailboxId, {
            '$junk': null,
        })
    }
}

function matchesRule(message: NonNullable<Awaited<ReturnType<typeof getMessage>>>, rule: MailRule) {
    const needle = rule.criteria.contains.toLowerCase().trim()
    if (!needle) {
        return false
    }

    if (rule.criteria.field === 'from') {
        return message.from.some(from => `${from.name || ''} ${from.email}`.toLowerCase().includes(needle))
    }

    if (rule.criteria.field === 'subject') {
        return message.subject.toLowerCase().includes(needle)
    }

    if (rule.criteria.field === 'body') {
        return message.textBody.toLowerCase().includes(needle) || message.preview.toLowerCase().includes(needle)
    }

    if (rule.criteria.field === 'senderDomain') {
        return message.from.some(from => from.email.toLowerCase().split('@')[1]?.includes(needle))
    }

    return false
}

function isTrustedInternalMail(message: NonNullable<Awaited<ReturnType<typeof getMessage>>>, mailboxAddress: string) {
    const ownAddress = mailboxAddress.toLowerCase()
    const allRecipients = [...message.to, ...message.cc, ...message.bcc].map(address => address.email.toLowerCase())
    const allSenders = message.from.map(address => address.email.toLowerCase())

    if (!allRecipients.includes(ownAddress) || !allSenders.length) {
        return false
    }

    return allSenders.every(address => address.endsWith(`@${mailConfig.domain}`))
}

function filterTable(userId: string) {
    return userId.startsWith('shared:') ? 'shared_mail_filters' : 'mail_filters'
}
