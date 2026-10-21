import { createHash } from 'node:crypto'
import run from '#db'

export type MailSendResponse = Record<string, unknown>
export type MailSendState = 'processing' | 'sent' | 'failed' | 'uncertain'

export function mailSendPayloadHash(mailboxUser: string, body: Record<string, unknown>) {
    const canonical = JSON.stringify({
        mailboxUser,
        to: body.to,
        cc: body.cc || '',
        bcc: body.bcc || '',
        replyTo: body.replyTo || '',
        subject: body.subject || '',
        textBody: body.textBody || '',
        htmlBody: body.htmlBody || '',
        attachments: Array.isArray(body.attachments) ? body.attachments : [],
    })
    return createHash('sha256').update(canonical).digest('hex')
}

export async function claimMailSend(actorId: string, mailboxUser: string, key: string, payloadHash: string) {
    const inserted = await run(`INSERT INTO mail_send_idempotency
        (actor_user_id, mailbox_user, idempotency_key, payload_hash, status)
        VALUES ($1, $2, $3, $4, 'processing')
        ON CONFLICT (actor_user_id, mailbox_user, idempotency_key) DO NOTHING
        RETURNING status, payload_hash, response_status, response_body, error_message`,
    [actorId, mailboxUser, key, payloadHash])
    const row = inserted.rows[0] || (await run(`SELECT status, payload_hash, response_status, response_body, error_message
        FROM mail_send_idempotency WHERE actor_user_id = $1 AND mailbox_user = $2 AND idempotency_key = $3`,
    [actorId, mailboxUser, key])).rows[0]
    if (!row) throw new Error('Mail send idempotency record could not be loaded.')
    return {
        inserted: Boolean(inserted.rows[0]),
        status: row.status as MailSendState,
        payloadHash: String(row.payload_hash).trim(),
        responseStatus: row.response_status ? Number(row.response_status) : null,
        responseBody: row.response_body as MailSendResponse | null,
        errorMessage: row.error_message as string | null,
    }
}

export async function finishMailSend(actorId: string, mailboxUser: string, key: string, status: Exclude<MailSendState, 'processing'>, responseStatus: number, responseBody: MailSendResponse, errorMessage = '') {
    await run(`UPDATE mail_send_idempotency SET status = $4, response_status = $5, response_body = $6::jsonb,
        error_message = NULLIF($7, ''), updated_at = NOW()
        WHERE actor_user_id = $1 AND mailbox_user = $2 AND idempotency_key = $3 AND status = 'processing'`,
    [actorId, mailboxUser, key, status, responseStatus, JSON.stringify(responseBody), errorMessage])
}

export async function updateMailSendResponse(actorId: string, mailboxUser: string, key: string, responseBody: MailSendResponse) {
    await run(`UPDATE mail_send_idempotency SET response_body = $4::jsonb, updated_at = NOW()
        WHERE actor_user_id = $1 AND mailbox_user = $2 AND idempotency_key = $3 AND status = 'sent'`,
    [actorId, mailboxUser, key, JSON.stringify(responseBody)])
}
