import { MailAccessDenied } from '#utils/mail/shared.ts'
import type { FastifyReply, FastifyRequest } from 'fastify'
import tokenWrapper from '#utils/auth/tokenWrapper.ts'
import { getMailAccess } from '#utils/mail/accounts.ts'
import { isMailAdminConfigError, mailAdminUnavailablePayload } from '#utils/mail/config.ts'
import { deleteMailRule } from '#utils/mail/filters.ts'

export default async function deleteMailFilter(req: FastifyRequest, res: FastifyReply) {
    const { valid, id } = await tokenWrapper(req, res)
    if (!valid || !id) {
        if (res.sent) return res
        return res.status(401).send({ error: 'Unauthorized.' })
    }

    const params = req.params as { id: string }
    const query = req.query as { mailboxUser?: string }

    try {
        const access = await getMailAccess(id, query.mailboxUser)
        await deleteMailRule(access.targetUser, params.id)
        return res.send({ ok: true })
    } catch (error) {
        if (error instanceof MailAccessDenied) return res.status(403).send({ error: error.message })
        if (isMailAdminConfigError(error)) {
            return res.status(503).send(mailAdminUnavailablePayload())
        }

        req.log.error(error)
        return res.status(500).send({ error: error instanceof Error ? error.message : 'Unable to delete filter.' })
    }
}
