import { createHash } from 'node:crypto'
import { MailAccessDenied } from '#utils/mail/shared.ts'
import type { FastifyReply, FastifyRequest } from 'fastify'
import tokenWrapper from '#utils/auth/tokenWrapper.ts'
import { getMailAccess } from '#utils/mail/accounts.ts'
import { isMailAdminConfigError, isMailServiceConnectionError, mailAdminUnavailablePayload, mailServiceUnavailablePayload } from '#utils/mail/config.ts'
import { downloadBlob } from '#utils/mail/jmap.ts'
import { blobResponsePolicy } from '#utils/mail/blobResponsePolicy.ts'
import { isVirusTotalClear, lookupFileHashReputation } from '#utils/mail/urlReputation.ts'

const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024

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
        const contentLength = Number(response.headers.get('content-length') || 0)
        if (contentLength > MAX_ATTACHMENT_BYTES) {
            await response.body?.cancel()
            return res.status(413).send({ error: 'This attachment exceeds the VirusTotal scan limit and remains blocked.', code: 'ATTACHMENT_SCAN_LIMIT' })
        }
        const arrayBuffer = await response.arrayBuffer()
        const bytes = Buffer.from(arrayBuffer)
        if (bytes.length > MAX_ATTACHMENT_BYTES) {
            return res.status(413).send({ error: 'This attachment exceeds the VirusTotal scan limit and remains blocked.', code: 'ATTACHMENT_SCAN_LIMIT' })
        }
        const sha256 = createHash('sha256').update(bytes).digest('hex')
        const reputation = await lookupFileHashReputation(sha256).catch(() => ({ provider: 'virustotal' as const, status: 'unavailable' as const }))
        if (!isVirusTotalClear(reputation)) {
            return res.status(424).send({ error: 'VirusTotal could not confirm this attachment is clear, so it remains blocked.', code: 'ATTACHMENT_NOT_CLEARED', reputation })
        }
        const policy = blobResponsePolicy(response.headers.get('content-type') || '', params.name, bytes)
        res.header('Content-Type', policy.contentType)
        res.header('Content-Disposition', policy.contentDisposition)
        res.header('X-Content-Type-Options', policy.nosniff)
        res.header('Content-Security-Policy', policy.contentSecurityPolicy)
        res.header('X-Mail-File-Reputation', JSON.stringify(reputation))
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
