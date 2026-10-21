import { MailAccessDenied } from '#utils/mail/shared.ts'
import type { FastifyReply, FastifyRequest } from 'fastify'
import tokenWrapper from '#utils/auth/tokenWrapper.ts'
import { getMailAccess } from '#utils/mail/accounts.ts'
import { isMailAdminConfigError, mailAdminUnavailablePayload } from '#utils/mail/config.ts'
import { createMailbox } from '#utils/mail/jmap.ts'

export default async function postMailbox(req: FastifyRequest, res: FastifyReply) {
    const { valid, id } = await tokenWrapper(req, res)
    if (!valid || !id) {
        if (res.sent) return res
        return res.status(401).send({ error: 'Unauthorized.' })
    }

    const body = req.body as { mailboxUser?: string, name: string, parentId?: string | null }
    if (!body.name?.trim()) {
        return res.status(400).send({ error: 'Mailbox name is required.' })
    }

    try {
        const access = await getMailAccess(id, body.mailboxUser)
        await createMailbox(access.username, access.password, body.name.trim(), body.parentId || null)
        return res.status(201).send({ ok: true })
    } catch (error) {
        if (error instanceof MailAccessDenied) return res.status(403).send({ error: error.message })
        if (isMailAdminConfigError(error)) {
            return res.status(503).send(mailAdminUnavailablePayload())
        }

        req.log.error(error)
        return res.status(500).send({ error: error instanceof Error ? error.message : 'Unable to create mailbox.' })
    }
}
