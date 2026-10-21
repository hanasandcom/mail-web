import run from '#db'
import { upsertMailAccount } from '#utils/db/identityDataWrites.ts'
import { MailAccessDenied } from './shared.ts'
import { mailConfig } from './config.ts'
import { encryptMailSecret, generateMailSecret } from './crypto.ts'
import { addressForUser, addressesForUser, mailboxLocalPartForUser } from './helpers.ts'
import { type AdminPatch, createPrincipal, ensureSetting, findPrincipalByName, patchPrincipal, setDomainCatchAllAddress } from './stalwartAdmin.ts'
import { getStoredMailSecret } from './accountSecrets.ts'

type UserRow = {
    id: string
    name: string
}

type MailAccountRow = {
    user_id: string
    mail_username: string
    mail_address: string
    mail_password_encrypted: string
    principal_id: number | null
    disabled_at?: string | null
}

export async function ensureMailInfrastructure() {
    await ensureSetting('server.hostname', mailConfig.host)
    await ensureSetting('http.url', `https://${mailConfig.host}`)
    await ensureSetting('spam-filter.auto-update', true)
    await ensureSetting('spam-filter.bayes.account.enable', true)
    await ensureDomainPrincipal()
}

export async function provisionExistingMailAccounts() {
    await ensureMailInfrastructure()
    const users = await run('SELECT u.id, u.name FROM users u LEFT JOIN mail_accounts ma ON ma.user_id = u.id WHERE u.active = TRUE AND ma.disabled_at IS NULL ORDER BY u.id ASC')
    for (const user of users.rows as UserRow[]) {
        await ensureMailAccountForUser(user.id, user.name).catch(error => {
            console.error(`Failed to provision mail account for ${user.id}`, error)
        })
    }
}

export async function ensureMailAccountForUser(userId: string, displayName: string, preferredSecret?: string) {
    await ensureDomainPrincipal()
    const existing = await getMailAccount(userId)
    if (existing?.disabled_at) throw new MailAccessDenied()
    const username = mailboxLocalPartForUser(userId)
    const address = addressForUser(userId)
    const allAddresses = addressesForUser(userId)
    const principal = await findPrincipalByName(username, 'individual')
    const inheritedSecret = principal?.secrets?.find(secret => !secret.startsWith('otpauth://')) || null
    const storedSecret = existing ? getStoredMailSecret(existing) : null
    const secret = preferredSecret || storedSecret || inheritedSecret || generateMailSecret()

    const principalId = !principal
        ? await createPrincipal({
            type: 'individual',
            quota: 0,
            name: username,
            description: displayName,
            secrets: [secret],
            emails: allAddresses,
            urls: [],
            memberOf: [],
            roles: ['user'],
            lists: [],
            members: [],
            enabledPermissions: [],
            disabledPermissions: [],
            externalMembers: [],
        })
        : principal.id
    const storedPrincipalId = typeof principalId === 'number' ? principalId : null

    if (principal) {
        const principalEmails = new Set(principal.emails || [])
        const patches: AdminPatch[] = [
            { action: 'set', field: 'description', value: displayName },
            { action: 'set', field: 'secrets', value: [secret] },
        ]
        if (!preferredSecret && inheritedSecret && !existing) patches.splice(1, 1)
        await patchPrincipal(principal.name, patches)

        for (const accountAddress of allAddresses) {
            if (principalEmails.has(accountAddress)) continue
            await patchPrincipal(principal.name, [{ action: 'addItem', field: 'emails', value: accountAddress }])
                .catch(error => {
                    if (!isAlreadyAttachedError(error)) throw error
                })
        }
    }

    await upsertMailAccount({
        userId,
        username,
        address,
        encryptedPassword: encryptMailSecret(secret),
        principalId: storedPrincipalId,
    })
    return { userId, username, address, password: secret, principalId: storedPrincipalId }
}

export async function syncMailPasswordForUser(userId: string, displayName: string, password: string) {
    return ensureMailAccountForUser(userId, displayName, password)
}

export async function rotateMailPasswordForUser(userId: string, displayName: string) {
    return ensureMailAccountForUser(userId, displayName, generateMailSecret())
}

export async function getMailAccount(userId: string) {
    const result = await run('SELECT * FROM mail_accounts WHERE user_id = $1', [userId])
    return (result.rows[0] as MailAccountRow | undefined) || null
}

async function ensureDomainPrincipal() {
    const catchAllAddress = `support@${mailConfig.domain}`
    const domain = await findPrincipalByName(mailConfig.domain, 'domain')
    if (!domain) {
        await createPrincipal({
            type: 'domain', quota: 0, name: mailConfig.domain, description: 'Hanasand mail domain', catchAllAddress,
            secrets: [], emails: [], urls: [], memberOf: [], roles: [], lists: [], members: [], enabledPermissions: [], disabledPermissions: [], externalMembers: [],
        })
    } else if (domain.catchAllAddress !== catchAllAddress) {
        try {
            await setDomainCatchAllAddress(mailConfig.domain, catchAllAddress)
        } catch (error) {
            if (!isDomainCatchAllUnsupported(error)) throw error
            await ensureSupportCatchAllAlias()
        }
    }
}

async function ensureSupportCatchAllAlias() {
    const alias = '@' + mailConfig.domain
    const support = await findPrincipalByName('support', 'individual')
    if (!support) throw new Error('The support mailbox is required for catch-all delivery.')
    if (support.emails?.includes(alias)) return
    await patchPrincipal('support', [{ action: 'addItem', field: 'emails', value: alias }])
}

function isDomainCatchAllUnsupported(error: unknown) {
    return error instanceof Error && error.message.includes('(400) for x:Domain/query')
}

function isAlreadyAttachedError(error: unknown) {
    return error instanceof Error && error.message.includes('fieldAlreadyExists')
}
