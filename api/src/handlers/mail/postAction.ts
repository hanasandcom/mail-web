import { MailAccessDenied } from '#utils/mail/shared.ts'
import type { FastifyReply, FastifyRequest } from 'fastify'
import tokenWrapper from '#utils/auth/tokenWrapper.ts'
import { getMailAccess } from '#utils/mail/accounts.ts'
import { isMailAdminConfigError, mailAdminUnavailablePayload } from '#utils/mail/config.ts'
import { ensureMailbox, moveMessage, patchMessageKeywords } from '#utils/mail/jmap.ts'

type ActionBody = {
    mailboxUser?: string
    action: 'read' | 'unread' | 'flag' | 'unflag' | 'archive' | 'junk' | 'ham' | 'trash' | 'restore' | 'move'
    targetMailboxId?: string
    targetMailboxName?: string
}

export default async function postMailAction(req: FastifyRequest, res: FastifyReply) {
    const { valid, id } = await tokenWrapper(req, res)
    if (!valid || !id) {
        if (res.sent) return res
        return res.status(401).send({ error: 'Unauthorized.' })
    }

    const params = req.params as { id: string }
    const body = req.body as ActionBody

    try {
        const access = await getMailAccess(id, body.mailboxUser)
        if (body.action === 'read') {
            await patchMessageKeywords(access.username, access.password, params.id, { '$seen': true })
        } else if (body.action === 'unread') {
            await patchMessageKeywords(access.username, access.password, params.id, { '$seen': null })
        } else if (body.action === 'flag') {
            await patchMessageKeywords(access.username, access.password, params.id, { '$flagged': true })
        } else if (body.action === 'unflag') {
            await patchMessageKeywords(access.username, access.password, params.id, { '$flagged': null })
        } else {
            const targetMailboxId = body.targetMailboxId
                || (body.targetMailboxName ? await ensureMailbox(access.username, access.password, body.targetMailboxName) : null)
                || (body.action === 'archive' ? await ensureMailbox(access.username, access.password, 'Archive') : null)
                || (body.action === 'junk' ? await ensureMailbox(access.username, access.password, 'Junk', 'junk') : null)
                || (body.action === 'ham' ? await ensureMailbox(access.username, access.password, 'Inbox', 'inbox') : null)
                || (body.action === 'trash' ? await ensureMailbox(access.username, access.password, 'Trash', 'trash') : null)
                || (body.action === 'restore' ? await ensureMailbox(access.username, access.password, 'Inbox', 'inbox') : null)

            if (!targetMailboxId) {
                return res.status(400).send({ error: 'Missing target mailbox.' })
            }

            const keywordPatch: Record<string, boolean | null> = {}
            if (body.action === 'archive') {
                keywordPatch.$seen = true
            } else if (body.action === 'junk') {
                keywordPatch.$junk = true
                keywordPatch.$seen = true
            } else if (body.action === 'ham' || body.action === 'restore') {
                keywordPatch.$junk = null
                keywordPatch.$deleted = null
            } else if (body.action === 'trash') {
                keywordPatch.$deleted = true
            }

            await moveMessage(access.username, access.password, params.id, targetMailboxId, keywordPatch)
        }

        return res.send({ ok: true })
    } catch (error) {
        if (error instanceof MailAccessDenied) return res.status(403).send({ error: error.message })
        if (isMailAdminConfigError(error)) {
            return res.status(503).send(mailAdminUnavailablePayload())
        }

        req.log.error(error)
        return res.status(500).send({ error: error instanceof Error ? error.message : 'Unable to update message.' })
    }
}
