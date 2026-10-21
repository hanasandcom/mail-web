import run from '#db'
import { mailPermissions, MailAccessDenied, sharedMailAccess, sharedMailboxes } from './shared.ts'
import { mailConfig } from './config.ts'
import { addressForUser } from './helpers.ts'
import { ensureMailAccountForUser, getMailAccount } from './accountProvisioning.ts'
import { getStoredMailSecret } from './accountSecrets.ts'

export {
    ensureMailInfrastructure,
    ensureMailAccountForUser,
    getMailAccount,
    provisionExistingMailAccounts,
    rotateMailPasswordForUser,
    syncMailPasswordForUser,
} from './accountProvisioning.ts'

type UserRow = {
    id: string
    name: string
}

export async function getMailAccess(actorId: string, mailboxUser?: string) {
    const targetUser = mailboxUser || actorId
    const permissions = await mailPermissions(actorId)
    const canAccessAnyMailbox = permissions.any
    if (targetUser.startsWith('shared:')) {
        if (!permissions.shared) throw new MailAccessDenied()
        const account = await sharedMailAccess(targetUser)
        return { actorId, targetUser, canAccessAnyMailbox, ...account, canSend: targetUser !== 'shared:noreply' || permissions.admin }
    }
    if (targetUser !== actorId && (!canAccessAnyMailbox || !(await mailPermissions(targetUser)).shared)) {
        throw new MailAccessDenied()
    }

    const userResult = await run('SELECT id, name FROM users WHERE id = $1', [targetUser])
    if (!userResult.rows.length) throw new Error('Mailbox owner not found.')

    const user = userResult.rows[0] as UserRow
    const existing = await getMailAccount(user.id)
    if (existing?.disabled_at) throw new MailAccessDenied()
    const storedPassword = existing ? getStoredMailSecret(existing) : null
    const account = existing && storedPassword
        ? { username: existing.mail_username, address: existing.mail_address, password: storedPassword }
        : await ensureMailAccountForUser(user.id, user.name)

    return {
        actorId,
        canSend: true,
        targetUser: user.id,
        canAccessAnyMailbox,
        username: account.username,
        address: account.address,
        password: account.password,
    }
}

export async function listAccessibleMailAccounts(actorId: string) {
    const permissions = await mailPermissions(actorId)
    const personal = await listPersonalMailAccounts(actorId, permissions.any)
    return [
        ...personal.map(account => ({ ...account, shared: false })),
        ...(permissions.shared ? sharedMailboxes.map(mailbox => ({
            id: mailbox.id,
            name: mailbox.name,
            address: `${mailbox.localPart}@${mailConfig.domain}`,
            shared: true,
        })) : []),
    ]
}

async function listPersonalMailAccounts(actorId: string, canAccessAnyMailbox: boolean) {
    if (canAccessAnyMailbox) {
        const rows = await run(`
            SELECT u.id, u.name, ma.mail_address
            FROM users u
            LEFT JOIN mail_accounts ma ON ma.user_id = u.id
            WHERE u.active = TRUE AND ma.disabled_at IS NULL
            ORDER BY u.id ASC
        `)

        return Promise.all(rows.rows.map(async (row) => {
            const user = row as UserRow & { mail_address?: string | null }
            return { id: user.id, name: user.name, address: user.mail_address || addressForUser(user.id) }
        }))
    }

    const row = await run('SELECT id, name FROM users WHERE id = $1', [actorId])
    if (!row.rows.length) return []

    const user = row.rows[0] as UserRow
    const account = await getMailAccount(user.id)
    if (account?.disabled_at) return []
    return [{ id: user.id, name: user.name, address: account?.mail_address || addressForUser(user.id) }]
}
