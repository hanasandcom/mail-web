import { createHash } from 'node:crypto'
import { MailAccessDenied } from '#utils/mail/shared.ts'
import type { FastifyReply, FastifyRequest } from 'fastify'
import tokenWrapper from '#utils/auth/tokenWrapper.ts'
import { getMailAccess } from '#utils/mail/accounts.ts'
import { isMailAdminConfigError, mailAdminUnavailablePayload } from '#utils/mail/config.ts'
import { downloadBlobWithSession, getMailSession, getMessage } from '#utils/mail/jmap.ts'
import { cacheAttachmentSha256, cachedAttachmentSha256, extractRemoteUrls, lookupFileHashReputation, lookupUrlReputation } from '#utils/mail/urlReputation.ts'

const MAX_INLINE_SCAN_BYTES = 100 * 1024 * 1024
const MAX_TOTAL_SCAN_BYTES = 200 * 1024 * 1024
const MAX_SCANNED_ATTACHMENTS = 50
const ATTACHMENT_SCAN_CONCURRENCY = 4

export default async function getMailMessageReputation(req: FastifyRequest, res: FastifyReply) {
    const { valid, id } = await tokenWrapper(req, res)
    if (!valid || !id) return res.sent ? res : res.status(401).send({ error: 'Unauthorized.' })

    const params = req.params as { id: string }
    const query = req.query as { mailboxUser?: string }
    if (!params.id || params.id.length > 512) return res.status(400).send({ error: 'A valid message id is required.' })

    try {
        const access = await getMailAccess(id, query.mailboxUser)
        const message = await getMessage(access.username, access.password, params.id)
        if (!message) return res.status(404).send({ error: 'Message not found.' })
        const remoteUrls = extractRemoteUrls(message.htmlBody || '')
        const results = await Promise.all(remoteUrls.map(async remote => ({ ...remote, reputation: await lookupUrlReputation(remote) })))
        const attachments = await scanAttachments(access.targetUser, access.username, access.password, message.attachments || [])
        return res.header('Cache-Control', 'no-store, private, max-age=0, must-revalidate')
            .send({ messageId: message.id, remoteUrls: results, attachments })
    } catch (error) {
        if (error instanceof MailAccessDenied) return res.status(403).send({ error: error.message })
        if (isMailAdminConfigError(error)) return res.status(503).send(mailAdminUnavailablePayload())
        req.log.error(error)
        return res.status(500).send({ error: error instanceof Error ? error.message : 'Unable to inspect message content.' })
    }
}

async function scanAttachments(mailboxUser: string, username: string, password: string, attachments: Array<{ blobId: string, name: string, size: number }>) {
    const results: Array<{ blobId: string, name: string, size: number, reputation: Awaited<ReturnType<typeof lookupFileHashReputation>> }> = []
    let scanBudget = 0
    const eligibleBlobIds = new Set<string>()
    for (const attachment of attachments.slice(0, MAX_SCANNED_ATTACHMENTS)) {
        const size = attachment.size || MAX_INLINE_SCAN_BYTES
        if (size <= MAX_INLINE_SCAN_BYTES && scanBudget + size <= MAX_TOTAL_SCAN_BYTES) {
            eligibleBlobIds.add(attachment.blobId)
            scanBudget += size
        }
    }
    let mailSession: ReturnType<typeof getMailSession> | null = null
    for (let start = 0; start < attachments.length; start += ATTACHMENT_SCAN_CONCURRENCY) {
        const batch = attachments.slice(start, start + ATTACHMENT_SCAN_CONCURRENCY)
        results.push(...await Promise.all(batch.map(async attachment => {
            const base = { blobId: attachment.blobId, name: attachment.name || 'attachment', size: attachment.size || 0 }
            if (!eligibleBlobIds.has(attachment.blobId)) {
                return { ...base, reputation: { provider: 'virustotal' as const, status: 'unavailable' as const } }
            }
            try {
                let sha256 = await cachedAttachmentSha256(mailboxUser, attachment.blobId)
                if (!sha256) {
                    mailSession ||= getMailSession(username, password)
                    const { session, accountId } = await mailSession
                    const response = await downloadBlobWithSession(username, password, session, accountId, attachment.blobId, base.name)
                    const contentLength = Number(response.headers.get('content-length') || 0)
                    if (contentLength > MAX_INLINE_SCAN_BYTES) {
                        await response.body?.cancel()
                        return { ...base, reputation: { provider: 'virustotal' as const, status: 'unavailable' as const } }
                    }
                    sha256 = await hashResponseBody(response, MAX_INLINE_SCAN_BYTES)
                    if (!sha256) return { ...base, reputation: { provider: 'virustotal' as const, status: 'unavailable' as const } }
                    await cacheAttachmentSha256(mailboxUser, attachment.blobId, sha256)
                }
                return { ...base, reputation: await lookupFileHashReputation(sha256) }
            } catch {
                return { ...base, reputation: { provider: 'virustotal' as const, status: 'unavailable' as const } }
            }
        })))
    }
    return results
}

async function hashResponseBody(response: Response, maxBytes: number) {
    if (!response.body) return null
    const reader = response.body.getReader()
    const hash = createHash('sha256')
    let total = 0
    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            total += value.byteLength
            if (total > maxBytes) {
                await reader.cancel()
                return null
            }
            hash.update(value)
        }
        return hash.digest('hex')
    } finally {
        reader.releaseLock()
    }
}
