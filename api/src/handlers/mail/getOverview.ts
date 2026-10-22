import { MailAccessDenied } from '#utils/mail/shared.ts'
import type { FastifyReply, FastifyRequest } from 'fastify'
import tokenWrapper from '#utils/auth/tokenWrapper.ts'
import { getMailAccess, listAccessibleMailAccounts } from '#utils/mail/accounts.ts'
import { getMailHealth } from '#utils/mail/health.ts'
import { getMailboxList, listMessagePage } from '#utils/mail/jmap.ts'
import { listRecentRecipients } from '#utils/mail/recentRecipients.ts'
import { addressForUser } from '#utils/mail/helpers.ts'
import { withDatabaseRetryBudget } from '#db'
import { loadMailboxOverviewData, settingsFor } from './overviewData.ts'

const MAIL_OVERVIEW_TIMEOUT_MS = Number(process.env.MAIL_OVERVIEW_TIMEOUT_MS || 6500)

export default async function getMailOverview(req: FastifyRequest, res: FastifyReply) {
    const { valid, id } = await tokenWrapper(req, res)
    if (!valid || !id) {
        if (res.sent) return res
        return res.status(401).send({ error: 'Unauthorized.' })
    }

    try {
        return await withDatabaseRetryBudget(8500, async () => {
            const query = req.query as { mailboxUser?: string, mailboxId?: string, messageId?: string, after?: string, unreadOnly?: string }
            const access = await getMailAccess(id, query.mailboxUser)
            if (query.after) {
                if (typeof query.after !== 'string' || query.after.length > 1024 || typeof query.mailboxId !== 'string') {
                    return res.status(400).send({ error: 'A mailbox and valid message cursor are required.' })
                }
                return res.send(await listMessagePage(access.username, access.password, query.mailboxId, query.after))
            }
            const accessibleAccountsPromise = withDeadline(listAccessibleMailAccounts(id), 2500, []).catch(() => [])
            if (query.unreadOnly === 'true') {
                return res
                    .header('Cache-Control', 'no-store, private, max-age=0, must-revalidate')
                    .send({ accessibleAccounts: await loadAccountCounts(id, await accessibleAccountsPromise, access.targetUser) })
            }
            const recentRecipientsPromise = withDeadline(listRecentRecipients(id, access.targetUser), 2500, []).catch(() => [])
            const healthPromise = withDeadline(getMailHealth(), 3500, null).catch(error => {
                req.log.warn({ error }, 'Failed to collect mail health checks')
                return null
            })
            const overviewController = new AbortController()
            const overviewDataPromise = withDeadline(loadMailboxOverviewData({
                actorId: id,
                access,
                query,
                health: null,
                accessibleAccounts: [],
                recentRecipients: [],
                signal: overviewController.signal,
                onRepair: error => req.log.warn({ error, userId: access.targetUser }, 'Stored mail credentials failed; rotating mailbox secret'),
                onRulesError: error => req.log.warn({ error }, 'Failed to apply mail rules'),
            }), MAIL_OVERVIEW_TIMEOUT_MS, null, () => overviewController.abort(new Error('Mail overview deadline exceeded.')))
            const accountCountsPromise = accessibleAccountsPromise.then(accounts => withDeadline(
                loadAccountCounts(id, accounts, access.targetUser),
                1000,
                accounts.map(account => ({ ...account, unreadCount: null })),
            )).catch(() => [])
            const [accessibleAccounts, recentRecipients, health, overviewData, accountCounts] = await Promise.all([
                accessibleAccountsPromise,
                recentRecipientsPromise,
                healthPromise,
                overviewDataPromise,
                accountCountsPromise,
            ])

            if (!overviewData) {
                req.log.warn({ userId: access.targetUser, timeoutMs: MAIL_OVERVIEW_TIMEOUT_MS }, 'Mail overview timed out; returning degraded payload')
                return res
                    .header('Cache-Control', 'no-store, private, max-age=0, must-revalidate')
                    .send(degradedMailOverview({
                        id,
                        targetUser: access.targetUser,
                        address: access.address,
                        canAccessAnyMailbox: access.canAccessAnyMailbox,
                        canSend: access.canSend,
                        accessibleAccounts,
                        recentRecipients,
                        health,
                        detail: `Mailbox service did not respond within ${MAIL_OVERVIEW_TIMEOUT_MS}ms. Message and folder actions are temporarily paused.`,
                    }))
            }

            overviewData.accessibleAccounts = accountCounts
            overviewData.recentRecipients = recentRecipients
            overviewData.health = health
            return res
                .header('Cache-Control', 'no-store, private, max-age=0, must-revalidate')
                .send(overviewData)
        })
    } catch (error) {
        if (error instanceof MailAccessDenied) return res.status(403).send({ error: error.message })
        const query = req.query as { mailboxUser?: string }
        if (isMailSetupUnavailable(error)) {
            const targetUser = query.mailboxUser || id
            const address = addressForUser(targetUser)
            return res
                .header('Cache-Control', 'no-store, private, max-age=0, must-revalidate')
                .send(degradedMailOverview({
                    id,
                    targetUser,
                    address,
                    canAccessAnyMailbox: false,
                    canSend: false,
                    accessibleAccounts: [{ id: targetUser, name: targetUser, address, shared: false }],
                    recentRecipients: [],
                    health: null,
                    detail: 'Mail administration is not configured on this environment.',
                    healthId: 'mail-admin',
                    healthLabel: 'Mail setup',
                }))
        }
        req.log.error(error)
        return res.status(500).send({ error: error instanceof Error ? error.message : 'Unable to load mailbox.' })
    }
}

export function withDeadline<T>(work: Promise<T>, timeoutMs: number, fallback: T, onTimeout?: () => void) {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            onTimeout?.()
            resolve(fallback)
        }, timeoutMs)
        work.then(value => { clearTimeout(timer); resolve(value) }, error => { clearTimeout(timer); reject(error) })
    })
}

export function degradedMailOverview({
    id,
    targetUser,
    address,
    canAccessAnyMailbox,
    canSend,
    accessibleAccounts,
    recentRecipients,
    health,
    detail,
    healthId = 'mail-overview-timeout',
    healthLabel = 'Mailbox service',
}: {
    id: string
    targetUser: string
    address: string
    canAccessAnyMailbox: boolean
    canSend: boolean
    accessibleAccounts: Awaited<ReturnType<typeof listAccessibleMailAccounts>>
    recentRecipients: Awaited<ReturnType<typeof listRecentRecipients>>
    health: Awaited<ReturnType<typeof getMailHealth>> | null
    detail: string
    healthId?: string
    healthLabel?: string
}) {
    return {
        actor: { id, canAccessAnyMailbox, canSend },
        mailboxUser: targetUser,
        mailboxAddress: address,
        accessibleAccounts,
        mailboxes: [],
        selectedMailboxId: null,
        messages: [],
        selectedMessage: null,
        filters: [],
        recentRecipients,
        health: {
            status: 'warning' as const,
            checkedAt: new Date().toISOString(),
            queueDepth: health?.queueDepth || 0,
            smtpBannerLatencyMs: health?.smtpBannerLatencyMs ?? null,
            checks: [
                {
                    id: healthId,
                    label: healthLabel,
                    status: 'warning' as const,
                    detail,
                },
                ...(health?.checks || []),
            ],
        },
        settings: settingsFor({ username: address, address }),
    }
}

function isMailSetupUnavailable(error: unknown) {
    return error instanceof Error && error.message.includes('MAIL_ADMIN_PASSWORD is required')
}

const unreadCache = new Map<string, { at: number, count: number }>()
async function loadAccountCounts(actorId: string, accounts: Awaited<ReturnType<typeof listAccessibleMailAccounts>>, selected: string) {
    return Promise.all(accounts.map(async account => {
        if (!account.shared && account.id !== actorId && account.id !== selected) return { ...account, unreadCount: null }
        const cached = unreadCache.get(account.id)
        if (cached && Date.now() - cached.at < 10_000) return { ...account, unreadCount: cached.count }
        const unreadCount = await withDeadline((async () => {
            const access = await getMailAccess(actorId, account.id)
            const { mailboxes } = await getMailboxList(access.username, access.password)
            const count = mailboxes.filter(mailbox => mailbox.role === 'inbox').reduce((sum, mailbox) => sum + (mailbox.unreadEmails || 0), 0)
            if (unreadCache.size > 500) unreadCache.clear()
            unreadCache.set(account.id, { at: Date.now(), count })
            return count
        })().catch(() => null), 3000, null)
        return { ...account, unreadCount }
    }))
}
