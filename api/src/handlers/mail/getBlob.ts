import { createHash } from 'node:crypto'
import { MailAccessDenied } from '#utils/mail/shared.ts'
import type { FastifyReply, FastifyRequest } from 'fastify'
import tokenWrapper from '#utils/auth/tokenWrapper.ts'
import { getMailAccess } from '#utils/mail/accounts.ts'
import { isMailAdminConfigError, isMailServiceConnectionError, mailAdminUnavailablePayload, mailServiceUnavailablePayload } from '#utils/mail/config.ts'
import { downloadBlob } from '#utils/mail/jmap.ts'
import { blobResponsePolicy } from '#utils/mail/blobResponsePolicy.ts'
import { lookupFileHashReputation } from '#utils/mail/urlReputation.ts'

export default async function getMailBlob(req: FastifyRequest, res: FastifyReply) {
    const { valid, id } = await tokenWrapper(req, res)
    if (!valid || !id) {
        if (res.sent) return res
        return res.status(401).send({ error: 'Unauthorized.' })
    }

    const params = req.params as { mailboxUser: string, blobId: string, name: string }

    try {
        const access = await getMailAccess(id, params.mailboxUser)
        const response = await downloadBlob(access.username, access.password, params.blobId, params.name)
        const arrayBuffer = await response.arrayBuffer()
        const bytes = Buffer.from(arrayBuffer)
        const policy = blobResponsePolicy(response.headers.get('content-type') || '', params.name, bytes)
        res.header('Content-Type', policy.contentType)
        res.header('Content-Disposition', policy.contentDisposition)
        res.header('X-Content-Type-Options', policy.nosniff)
        res.header('Content-Security-Policy', policy.contentSecurityPolicy)
        if (bytes.length <= 100 * 1024 * 1024) {
            const sha256 = createHash('sha256').update(bytes).digest('hex')
            const reputation = await lookupFileHashReputation(sha256).catch(() => ({ provider: 'virustotal' as const, status: 'unavailable' as const }))
            res.header('X-Mail-File-Reputation', JSON.stringify(reputation))
        }
        res.header('Cache-Control', 'private, max-age=60')
        return res.send(bytes)
    } catch (error) {
        if (error instanceof MailAccessDenied) return res.status(403).send({ error: error.message })
        if (isMailAdminConfigError(error)) {
            return res.status(503).send(mailAdminUnavailablePayload())
        }

        if (isMailServiceConnectionError(error)) {
            return res.status(502).send(mailServiceUnavailablePayload('fetching the attachment'))
        }

        req.log.error(error)
        return res.status(500).send({ error: error instanceof Error ? error.message : 'Unable to fetch attachment.' })
    }
}
