import run from '#db'
import { mailConfig } from './config.ts'
import { encryptMailSecret, generateMailSecret, tryDecryptMailSecret } from './crypto.ts'
import { createPrincipal, findPrincipalByName, patchPrincipal } from './stalwartAdmin.ts'
import { hasHanasandInternalPageAccess } from '#utils/auth/organizationPageAccess.ts'

export const sharedMailboxes = [
    { id: 'shared:support', name: 'Support', localPart: 'support' },
    { id: 'shared:sales', name: 'Sales', localPart: 'sales' },
    { id: 'shared:postmaster', name: 'Postmaster', localPart: 'postmaster' },
    { id: 'shared:security', name: 'Security', localPart: 'security' },
    { id: 'shared:noreply', name: 'Noreply', localPart: mailConfig.systemSenderLocalPart },
]

export class MailAccessDenied extends Error {
    constructor() { super('You do not have access to this mailbox.') }
}

export async function mailPermissions(actorId: string) {
    const internalMember = await hasHanasandInternalPageAccess(actorId)
    return { admin: internalMember, shared: internalMember, any: internalMember }
}

// Secrets are encrypted in the database; shared mailboxes are not website users.
export async function sharedMailAccess(id: string) {
    const definition = sharedMailboxes.find(mailbox => mailbox.id === id)
    if (!definition) throw new MailAccessDenied()
    if (id === 'shared:noreply') {
        const { systemSenderAccess } = await import('./system.ts')
        return systemSenderAccess()
    }
    const result = await run('SELECT * FROM shared_mail_accounts WHERE id = $1', [id])
    const row = result.rows[0]
    const password = row && tryDecryptMailSecret(row.mail_password_encrypted)
    if (!password) throw new Error(`Shared mailbox ${definition.name} has not been provisioned.`)
    return { username: row.mail_username as string, address: row.mail_address as string, password }
}

// Run during deployment, not on every inbox poll. Existing credentials are retained.
export async function provisionSharedMailboxes(ids = sharedMailboxes.map(mailbox => mailbox.id)) {
    for (const mailbox of sharedMailboxes.filter(mailbox => ids.includes(mailbox.id))) {
        if (mailbox.id === 'shared:noreply') {
            const { ensureSystemSender } = await import('./system.ts')
            const account = await ensureSystemSender()
            await run(`INSERT INTO shared_mail_accounts (id, mail_username, mail_address, mail_password_encrypted)
                VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET mail_password_encrypted = EXCLUDED.mail_password_encrypted`,
            [mailbox.id, account.username, account.address, encryptMailSecret(account.password)])
            continue
        }
        const existing = await run('SELECT * FROM shared_mail_accounts WHERE id = $1', [mailbox.id])
        const row = existing.rows[0]
        const address = `${mailbox.localPart}@${mailConfig.domain}`
        const password = row ? tryDecryptMailSecret(row.mail_password_encrypted) : generateMailSecret()
        if (!password) throw new Error(`Cannot decrypt ${mailbox.name} mailbox credentials.`)
        const principal = await findPrincipalByName(mailbox.localPart, 'individual')
        if (principal && !row) throw new Error(`Existing ${mailbox.name} mailbox must be linked before provisioning; credentials were not changed.`)
        await run(`INSERT INTO shared_mail_accounts (id, mail_username, mail_address, mail_password_encrypted)
            VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
        [mailbox.id, mailbox.localPart, address, encryptMailSecret(password)])
        if (!principal) {
            await createPrincipal({ type: 'individual', name: mailbox.localPart, description: mailbox.name,
                secrets: [password], emails: [address], roles: ['user'], quota: 0 })
        } else if (!principal.emails?.includes(address)) {
            await patchPrincipal(principal.name, [{ action: 'addItem', field: 'emails', value: address }])
        }
    }
}
