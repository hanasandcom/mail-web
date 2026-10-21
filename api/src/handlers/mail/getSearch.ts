import { MailAccessDenied } from '#utils/mail/shared.ts'
import type { FastifyReply, FastifyRequest } from 'fastify'
import tokenWrapper from '#utils/auth/tokenWrapper.ts'
import { getMailAccess } from '#utils/mail/accounts.ts'
import { isMailAdminConfigError, mailAdminUnavailablePayload } from '#utils/mail/config.ts'
import { searchMessagePage } from '#utils/mail/jmap.ts'

const MAX_SEARCH_LENGTH = 200

export default async function getMailSearch(req: FastifyRequest, res: FastifyReply) {
    const { valid, id } = await tokenWrapper(req, res)
    if (!valid || !id) return res.sent ? res : res.status(401).send({ error: 'Unauthorized.' })

    const query = req.query as { mailboxUser?: string, mailboxId?: string, query?: string, after?: string }
    const text = typeof query.query === 'string' ? query.query.trim() : ''
    if (!text || text.length > MAX_SEARCH_LENGTH || typeof query.mailboxId !== 'string' || !query.mailboxId.trim()) {
        return res.status(400).send({ error: `A search query of 1 to ${MAX_SEARCH_LENGTH} characters and a mailbox are required.` })
    }
    if (query.after !== undefined && (typeof query.after !== 'string' || !query.after || query.after.length > 1024)) {
        return res.status(400).send({ error: 'A valid message cursor is required.' })
    }

    const searchStartedAt = performance.now()
    try {
        const access = await getMailAccess(id, query.mailboxUser)
        const page = await searchMessagePage(access.username, access.password, query.mailboxId, text, query.after)
        req.log.info({ mailSearchDurationMs: Number((performance.now() - searchStartedAt).toFixed(2)) }, 'Mailbox search completed')
        return res.header('Cache-Control', 'no-store, private, max-age=0, must-revalidate').send(page)
    } catch (error) {
        if (error instanceof MailAccessDenied) return res.status(403).send({ error: error.message })
        if (isMailAdminConfigError(error)) return res.status(503).send(mailAdminUnavailablePayload())
        req.log.error(error)
        return res.status(500).send({ error: error instanceof Error ? error.message : 'Unable to search this mailbox.' })
    }
}
