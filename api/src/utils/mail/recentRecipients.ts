import run from '#db'
import type { MailAddress, RecentMailRecipient } from './types.ts'

type RecipientRow = {
    email: string
    name: string
    use_count: number
    last_used_at: string
}

function normalizeEmail(email: string) {
    return email.trim().toLowerCase()
}

export async function rememberRecentRecipients(ownerUserId: string, mailboxUser: string, recipients: MailAddress[]) {
    const deduped = new Map<string, string>()

    for (const recipient of recipients) {
        const email = normalizeEmail(recipient.email || '')
        if (!email) {
            continue
        }

        if (!deduped.has(email)) {
            deduped.set(email, (recipient.name || '').trim())
        }
    }

    for (const [email, name] of deduped.entries()) {
        await run(`
            INSERT INTO mail_recent_recipients (owner_user_id, mailbox_user, email, name, use_count, last_used_at)
            VALUES ($1, $2, $3, $4, 1, NOW())
            ON CONFLICT (owner_user_id, mailbox_user, email)
            DO UPDATE SET
                name = CASE
                    WHEN EXCLUDED.name <> '' THEN EXCLUDED.name
                    ELSE mail_recent_recipients.name
                END,
                use_count = mail_recent_recipients.use_count + 1,
                last_used_at = NOW()
        `, [ownerUserId, mailboxUser, email, name])
    }
}

export async function listRecentRecipients(ownerUserId: string, mailboxUser: string, limit = 12): Promise<RecentMailRecipient[]> {
    const response = await run(`
        SELECT email, name, use_count, last_used_at
        FROM mail_recent_recipients
        WHERE owner_user_id = $1 AND mailbox_user = $2
        ORDER BY last_used_at DESC, use_count DESC, email ASC
        LIMIT $3
    `, [ownerUserId, mailboxUser, limit])

    return response.rows.map((row: RecipientRow) => ({
        email: row.email,
        name: row.name || undefined,
        useCount: row.use_count,
        lastUsedAt: row.last_used_at,
    }))
}
