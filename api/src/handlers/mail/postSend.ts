import { MailAccessDenied } from '#utils/mail/shared.ts'
import type { FastifyReply, FastifyRequest } from 'fastify'
import tokenWrapper from '#utils/auth/tokenWrapper.ts'
import { getMailAccess } from '#utils/mail/accounts.ts'
import { isMailAdminConfigError, isMailServiceConnectionError, mailAdminUnavailablePayload, mailServiceUnavailablePayload } from '#utils/mail/config.ts'
import { parseAddressInput } from '#utils/mail/helpers.ts'
import { storeSentMessage, uploadAttachment } from '#utils/mail/jmap.ts'
import { rememberRecentRecipients } from '#utils/mail/recentRecipients.ts'
import { sendMailViaSmtp } from '#utils/mail/smtp.ts'
import { claimMailSend, finishMailSend, mailSendPayloadHash, updateMailSendResponse } from '#utils/mail/sendIdempotency.ts'

type AttachmentBody = { name: string, type: string, contentBase64: string }
type SendBody = {
    mailboxUser?: string
    to: string
    cc?: string
    bcc?: string
    replyTo?: string
    subject: string
    textBody: string
    htmlBody?: string
    attachments?: AttachmentBody[]
}

export default async function postSendMail(req: FastifyRequest, res: FastifyReply) {
    const { valid, id } = await tokenWrapper(req, res)
    if (!valid || !id) return res.sent ? res : res.status(401).send({ error: 'Unauthorized.' })

    const key = singleHeader(req.headers['idempotency-key'])
    if (!key || key.length < 16 || key.length > 200 || /[\r\n]/.test(key)) {
        return res.status(400).send({ error: 'Idempotency-Key must contain 16-200 characters.', code: 'INVALID_IDEMPOTENCY_KEY' })
    }
    const body = req.body as SendBody
    let access: Awaited<ReturnType<typeof getMailAccess>>
    try {
        access = await getMailAccess(id, body.mailboxUser)
        if (access.canSend === false) throw new MailAccessDenied()
    } catch (error) {
        return sendAccessError(req, res, error)
    }

    if (!body.to?.trim()) return res.status(400).send({ error: 'A recipient is required.' })
    if (!body.subject?.trim() && !body.textBody?.trim() && !(body.attachments || []).length) {
        return res.status(400).send({ error: 'Write a message, add a subject, or include an attachment before sending.' })
    }

    let to: ReturnType<typeof parseAddressInput>
    let cc: ReturnType<typeof parseAddressInput>
    let bcc: ReturnType<typeof parseAddressInput>
    let replyTo: ReturnType<typeof parseAddressInput>
    try {
        to = parseAddressInput(body.to)
        cc = parseAddressInput(body.cc || '')
        bcc = parseAddressInput(body.bcc || '')
        replyTo = parseAddressInput(body.replyTo || '')
    } catch (error) {
        return res.status(400).send({ error: error instanceof Error ? error.message : 'Invalid mail address.' })
    }

    const payloadHash = mailSendPayloadHash(access.targetUser, body as unknown as Record<string, unknown>)
    let claim: Awaited<ReturnType<typeof claimMailSend>>
    try {
        claim = await claimMailSend(id, access.targetUser, key, payloadHash)
    } catch (error) {
        req.log.error(error)
        return res.status(503).send({ error: 'Unable to establish a durable send record. The message was not sent.', code: 'MAIL_SEND_RECORD_UNAVAILABLE', retryable: true })
    }

    if (!claim.inserted) {
        if (claim.payloadHash !== payloadHash) return res.status(409).send({ error: 'Idempotency-Key was already used for a different message.', code: 'IDEMPOTENCY_CONFLICT' })
        if (claim.status === 'sent' && claim.responseBody) {
            return res.header('Cache-Control', 'no-store, private, max-age=0, must-revalidate')
                .status(claim.responseStatus || 201).send(claim.responseBody)
        }
        if (claim.status === 'failed' && claim.responseBody) {
            return res.header('Cache-Control', 'no-store, private, max-age=0, must-revalidate')
                .status(claim.responseStatus || 500).send(claim.responseBody)
        }
        if (claim.status === 'uncertain') {
            if (claim.responseBody) return res.header('Cache-Control', 'no-store, private, max-age=0, must-revalidate')
                .status(claim.responseStatus || 502).send(claim.responseBody)
            return res.status(409).send({ error: 'The previous send may have reached the mail server. Check Sent before attempting another send.', code: 'MAIL_SEND_OUTCOME_UNKNOWN', retryable: false })
        }
        return res.status(409).send({ error: 'A send with this key is already in progress. Retry with the same key shortly; it will not send a second copy.', code: 'MAIL_SEND_IN_PROGRESS', retryable: true })
    }

    let smtpAttempted = false
    let smtpAccepted = false
    const from = { email: access.address, name: access.targetUser }
    const message = {
        username: access.username,
        password: access.password,
        from,
        to,
        cc,
        bcc,
        replyTo,
        subject: body.subject || '(No subject)',
        textBody: body.textBody,
        htmlBody: body.htmlBody,
    }

    try {
        const attachments = await Promise.all((body.attachments || []).map(async attachment => {
            const uploaded = await uploadAttachment(access.username, access.password, attachment.name, attachment.type, attachment.contentBase64)
            return { blobId: uploaded.blobId, size: uploaded.size, type: uploaded.type || attachment.type, name: attachment.name, contentBase64: attachment.contentBase64 }
        }))

        smtpAttempted = true
        const smtpResult = await sendMailViaSmtp({ ...message, attachments })
        smtpAccepted = true
        const successBody = { ok: true, mailboxUser: access.targetUser, sentMailboxId: null, sentMessageId: null }
        await finishMailSend(id, access.targetUser, key, 'sent', 201, successBody)

        const sendResult = await storeSentMessage({ ...message, attachments }).catch(error => {
            req.log.warn({ error, mailboxUser: access.targetUser }, 'SMTP accepted message but saving to Sent failed')
            return { sentMailboxId: null, sentMessageId: null }
        })
        const finalBody = { ...successBody, sentMailboxId: sendResult.sentMailboxId, sentMessageId: sendResult.sentMessageId, smtpMessageId: smtpResult?.messageId || null }
        let responseBody: Record<string, unknown> = successBody
        await updateMailSendResponse(id, access.targetUser, key, finalBody).then(() => {
            responseBody = finalBody
        }).catch(error => {
            req.log.warn({ error }, 'Unable to update stored send result after Sent mailbox save')
        })
        await rememberRecentRecipients(id, access.targetUser, [...to, ...cc, ...bcc]).catch(error => {
            req.log.warn({ error }, 'Unable to update recent mail recipients after send')
        })
        return res.header('Cache-Control', 'no-store, private, max-age=0, must-revalidate').status(201).send(responseBody)
    } catch (error) {
        const knownRecipientRejection = smtpAttempted && isRecipientRejectedError(error)
        const status = knownRecipientRejection ? 400 : isMailAdminConfigError(error) ? 503 : (isMailServiceConnectionError(error) || (error instanceof Error && /attachment upload failed/i.test(error.message)) ? 502 : 500)
        const payload = knownRecipientRejection
            ? { error: 'The mail server rejected the recipient. Check the address or send to a Hanasand mailbox.', code: 'MAIL_RECIPIENT_REJECTED', retryable: false }
            : smtpAttempted && !smtpAccepted
                ? { error: 'The mail server did not confirm whether it accepted this message. Check Sent before trying again.', code: 'MAIL_SEND_OUTCOME_UNKNOWN', retryable: false }
                : isMailServiceConnectionError(error)
                    ? mailServiceUnavailablePayload('sending mail')
                    : { error: error instanceof Error ? error.message : 'Unable to send mail.' }
        const state = smtpAttempted && !knownRecipientRejection ? 'uncertain' : 'failed'
        await finishMailSend(id, access.targetUser, key, state, state === 'uncertain' ? 502 : status, payload).catch(recordError => {
            req.log.error({ error: recordError, originalError: error }, 'Unable to persist failed mail send state')
        })
        if (error instanceof MailAccessDenied) return res.status(403).send({ error: error.message })
        if (isMailAdminConfigError(error)) return res.status(503).send(mailAdminUnavailablePayload())
        req.log.error(error)
        return res.status(state === 'uncertain' ? 502 : status).send(payload)
    }
}

function singleHeader(value: string | string[] | undefined) {
    return typeof value === 'string' ? value.trim() : ''
}

function isRecipientRejectedError(error: unknown) {
    return error instanceof Error && /recipient|relay not allowed|550 5\.1\./i.test(error.message)
}

function sendAccessError(req: FastifyRequest, res: FastifyReply, error: unknown) {
    if (error instanceof MailAccessDenied) return res.status(403).send({ error: error.message })
    if (isMailAdminConfigError(error)) return res.status(503).send(mailAdminUnavailablePayload())
    req.log.error(error)
    return res.status(500).send({ error: error instanceof Error ? error.message : 'Unable to access mailbox.' })
}
