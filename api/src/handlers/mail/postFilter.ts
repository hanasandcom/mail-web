import { MailAccessDenied } from '#utils/mail/shared.ts'
import type { FastifyReply, FastifyRequest } from 'fastify'
import tokenWrapper from '#utils/auth/tokenWrapper.ts'
import { getMailAccess } from '#utils/mail/accounts.ts'
import { isMailAdminConfigError, mailAdminUnavailablePayload } from '#utils/mail/config.ts'
import { createMailRule } from '#utils/mail/filters.ts'

export default async function postMailFilter(req: FastifyRequest, res: FastifyReply) {
    const { valid, id } = await tokenWrapper(req, res)
    if (!valid || !id) {
        if (res.sent) return res
        return res.status(401).send({ error: 'Unauthorized.' })
    }

    const body = req.body as {
        mailboxUser?: string
        name: string
        enabled?: boolean
        criteria: { field: 'from' | 'subject' | 'body' | 'senderDomain', contains: string }
        action: { type: 'move', mailboxName: string, markRead?: boolean }
    }

    try {
        const access = await getMailAccess(id, body.mailboxUser)
        if (!body.name?.trim() || !body.criteria?.contains?.trim() || !body.action?.mailboxName?.trim()) {
            return res.status(400).send({ error: 'Filter name, match text, and target mailbox are required.' })
        }

        const rule = await createMailRule(access.targetUser, {
            name: body.name.trim(),
            enabled: body.enabled ?? true,
            criteria: body.criteria,
            action: body.action,
        })

        return res.status(201).send(rule)
    } catch (error) {
        if (error instanceof MailAccessDenied) return res.status(403).send({ error: error.message })
        if (isMailAdminConfigError(error)) {
            return res.status(503).send(mailAdminUnavailablePayload())
        }

        req.log.error(error)
        return res.status(500).send({ error: error instanceof Error ? error.message : 'Unable to create filter.' })
    }
}
