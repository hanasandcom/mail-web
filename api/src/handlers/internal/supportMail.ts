import { createHash, timingSafeEqual } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { sharedMailAccess } from '#utils/mail/shared.ts'
import { getMailboxList } from '#utils/mail/jmapMailbox.ts'
import { jmapCall } from '#utils/mail/jmapSession.ts'
import type { EmailRecord } from '#utils/mail/jmapTypes.ts'
import { sendMailViaSmtp } from '#utils/mail/smtp.ts'
import { claimMailSend, finishMailSend, mailSendPayloadHash } from '#utils/mail/sendIdempotency.ts'
import type { MailAddress } from '#utils/mail/types.ts'
import { mailConfig } from '#utils/mail/config.ts'

type InboxQuery = { after?: string, position?: string, limit?: string }
type SendBody = {
    idempotencyKey?: string
    to?: string
    subject?: string
    textBody?: string
    inReplyTo?: string
    references?: string[]
}

const ACTOR_ID = 'mail-support-bridge'
const MAILBOX_USER = 'shared:support'
const MAX_PAGE_SIZE = 100

export async function getSupportInbox(req: FastifyRequest<{ Querystring: InboxQuery }>, res: FastifyReply) {
    if (!authorized(req)) return res.code(403).send({ error: 'Forbidden' })
    const after = req.query.after || '1970-01-01T00:00:00.000Z'
    const afterTime = Date.parse(after)
    const position = Number(req.query.position || 0)
    const limit = Number(req.query.limit || 50)
    if (!Number.isFinite(afterTime) || !Number.isInteger(position) || position < 0
        || !Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
        return res.code(400).send({ error: 'Invalid inbox page.' })
    }

    try {
        const access = await sharedMailAccess(MAILBOX_USER)
        const { session, accountId, mailboxes } = await getMailboxList(access.username, access.password)
        const inbox = mailboxes.find(mailbox => mailbox.role === 'inbox')
        if (!inbox) return res.code(503).send({ error: 'Support Inbox is unavailable.' })
        const query = await jmapCall<{ ids?: string[], total?: number }>(access.username, access.password, session, [
            ['Email/query', {
                accountId,
                filter: { inMailbox: inbox.id, after: new Date(afterTime).toISOString() },
                sort: [{ property: 'receivedAt', isAscending: true }],
                position,
                limit,
            }, 'support-query'],
        ])
        const ids = query.ids || []
        const result = ids.length ? await jmapCall<{ list?: EmailRecord[] }>(access.username, access.password, session, [
            ['Email/get', {
                accountId,
                ids,
                properties: ['id', 'messageId', 'inReplyTo', 'references', 'subject', 'receivedAt', 'from', 'to', 'textBody', 'htmlBody', 'bodyValues'],
                fetchAllBodyValues: true,
            }, 'support-emails'],
        ]) : { list: [] }
        const byId = new Map((result.list || []).map(message => [message.id, message]))
        return res.header('Cache-Control', 'no-store').send({
            messages: ids.flatMap(id => {
                const message = byId.get(id)
                const from = message?.from?.[0]
                if (!message || !from?.email) return []
                const body = extractText(message)
                return [{
                    id: message.id,
                    messageId: headerId(message.messageId),
                    inReplyTo: headerId(message.inReplyTo),
                    references: (message.references || []).flatMap(value => parseMessageIds(value)),
                    subject: (message.subject || '(No subject)').slice(0, 512),
                    receivedAt: message.receivedAt || '',
                    from: { email: from.email, name: from.name || '' },
                    textBody: body.slice(0, 50_000),
                }]
            }),
            position,
            nextPosition: ids.length === limit ? position + ids.length : null,
        })
    } catch (error) {
        req.log.error(error)
        return res.code(502).send({ error: 'Could not read the Support mailbox.' })
    }
}

export async function postSupportMail(req: FastifyRequest<{ Body: SendBody }>, res: FastifyReply) {
    if (!authorized(req)) return res.code(403).send({ error: 'Forbidden' })
    const body = req.body || {}
    const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : ''
    const to = typeof body.to === 'string' ? body.to.trim().toLowerCase() : ''
    const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 512) : ''
    const textBody = typeof body.textBody === 'string' ? body.textBody.trim().slice(0, 50_000) : ''
    const inReplyTo = typeof body.inReplyTo === 'string' ? normalizeMessageId(body.inReplyTo) : ''
    const references = Array.isArray(body.references) ? body.references.slice(-20).flatMap(value => typeof value === 'string' ? parseMessageIds(value) : []) : []
    if (idempotencyKey.length < 16 || idempotencyKey.length > 200 || /[\r\n]/.test(idempotencyKey)
        || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to) || !subject || !textBody
        || (body.inReplyTo && !inReplyTo)) {
        return res.code(400).send({ error: 'Invalid support email.' })
    }

    try {
        const access = await sharedMailAccess(MAILBOX_USER)
        const messageId = `<support-${createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 32)}@${mailConfig.domain}>`
        const payload = { to, subject, textBody, inReplyTo, references, messageId }
        const payloadHash = mailSendPayloadHash(MAILBOX_USER, payload)
        const claim = await claimMailSend(ACTOR_ID, access.username, idempotencyKey, payloadHash)
        if (!claim.inserted) {
            if (claim.payloadHash !== payloadHash) return res.code(409).send({ error: 'Idempotency key conflict.' })
            if ((claim.status === 'sent' || claim.status === 'failed' || claim.status === 'uncertain') && claim.responseBody) {
                return res.code(claim.responseStatus || 409).send(claim.responseBody)
            }
            return res.code(409).send({ error: 'A matching send is already in progress; retry with the same key.' })
        }
        try {
            const result = await sendMailViaSmtp({
                username: access.username,
                password: access.password,
                from: { email: access.address, name: 'Hanasand Support' },
                to: [{ email: to }],
                subject,
                textBody,
                messageId,
                ...(inReplyTo ? { inReplyTo } : {}),
                ...(references.length ? { references } : {}),
            })
            const response = { ok: true, messageId: result.messageId || messageId }
            await finishMailSend(ACTOR_ID, access.username, idempotencyKey, 'sent', 200, response)
            return res.code(200).send(response)
        } catch (error) {
            const response = { error: 'The mail server did not confirm whether it accepted this message. Do not resend with a new key.' }
            await finishMailSend(ACTOR_ID, access.username, idempotencyKey, 'uncertain', 502, response,
                error instanceof Error ? error.message.slice(0, 500) : 'SMTP outcome uncertain').catch(recordError => req.log.error(recordError))
            req.log.error(error)
            return res.code(502).send(response)
        }
    } catch (error) {
        req.log.error(error)
        return res.code(503).send({ error: 'Support mail is not available.' })
    }
}

function authorized(req: FastifyRequest) {
    const expected = process.env.MAIL_SUPPORT_BRIDGE_KEY || ''
    const provided = req.headers['x-mail-support-key']
    if (expected.length < 32 || typeof provided !== 'string') return false
    const expectedBytes = Buffer.from(expected)
    const providedBytes = Buffer.from(provided)
    return providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes)
}

function headerId(value: string[] | undefined) {
    return (value || []).flatMap(parseMessageIds)[0] || ''
}

function parseMessageIds(values: string | string[]) {
    const input = Array.isArray(values) ? values.join(' ') : values
    return input.match(/<[^<>\s]+@[^<>\s]+>/g) || []
}

function normalizeMessageId(value: string) {
    return parseMessageIds(value)[0] || ''
}

function extractText(message: EmailRecord) {
    const partId = message.textBody?.[0]?.partId
    const plainText = partId ? message.bodyValues?.[partId]?.value || '' : ''
    if (plainText) return plainText
    const htmlPartId = message.htmlBody?.[0]?.partId
    const html = htmlPartId ? message.bodyValues?.[htmlPartId]?.value || '' : ''
    const strippedHtml = html.replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/p\s*>/gi, '\n\n').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').trim()
    return strippedHtml || message.preview || ''
}
