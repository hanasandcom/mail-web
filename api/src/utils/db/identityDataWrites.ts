import run from '#db'

export async function upsertMailAccount(input: {
    userId: string
    username: string
    address: string
    encryptedPassword: string
    principalId: number | null
}) {
    const updated = await run(`
        UPDATE mail_accounts
           SET mail_username = $2, mail_address = $3, mail_password_encrypted = $4,
               principal_id = $5, updated_at = NOW()
         WHERE user_id = $1
        RETURNING user_id
    `, [input.userId, input.username, input.address, input.encryptedPassword, input.principalId])
    if (updated.rowCount) return
    await run(`
        INSERT INTO mail_accounts (user_id, mail_username, mail_address, mail_password_encrypted, principal_id)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (user_id) DO UPDATE SET mail_username = EXCLUDED.mail_username,
            mail_address = EXCLUDED.mail_address, mail_password_encrypted = EXCLUDED.mail_password_encrypted,
            principal_id = EXCLUDED.principal_id, updated_at = NOW()
    `, [input.userId, input.username, input.address, input.encryptedPassword, input.principalId])
}
