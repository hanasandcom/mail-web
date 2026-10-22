import { expect, mock, test } from 'bun:test'

let internalMember = false
let mailboxReads = 0
let sharedAccountRow: Record<string, string> | null = { mail_username: 'support', mail_address: 'support@example.test', mail_password_encrypted: 'encrypted' }
let principal: { name: string, emails?: string[], secrets?: string[] } | null = null
let insertedSharedAccount: unknown[] | null = null
let patchedPrincipal = false
let createdPrincipal: Record<string, unknown> | null = null

mock.module('../src/utils/db.ts', () => ({ default: async (sql: string, values: unknown[] = []) => {
    if (sql.includes('shared_mail_accounts')) {
        if (sql.trimStart().startsWith('INSERT')) {
            insertedSharedAccount = [...values]
            return { rows: [] }
        }
        mailboxReads += 1
        return { rows: sharedAccountRow ? [sharedAccountRow] : [] }
    }
    if (sql.includes('SELECT id, name FROM users')) return { rows: [{ id: 'member', name: 'Member' }] }
    if (sql.includes('FROM mail_accounts')) return { rows: [{ mail_username: 'member', mail_address: 'member@example.test', mail_password_encrypted: 'encrypted' }] }
    return { rows: [] }
} }))
mock.module('../src/utils/auth/organizationPageAccess.ts', () => ({ hasHanasandInternalPageAccess: async (id: string) => internalMember && id === 'member' }))
mock.module('../src/utils/mail/config.ts', () => ({
    requireMailAdminConfig: () => { throw new Error('unused') },
    mailConfig: { domain: 'example.test', systemSenderLocalPart: 'noreply', userAliases: new Map() },
}))
mock.module('../src/utils/mail/crypto.ts', () => ({
    tryDecryptMailSecret: () => 'test-secret',
    encryptMailSecret: (secret: string) => `enc:${secret}`,
    generateMailSecret: () => 'test-secret',
}))
mock.module('../src/utils/mail/stalwartAdmin.ts', () => ({
    createPrincipal: (value: Record<string, unknown>) => { createdPrincipal = value; return 1 },
    findPrincipalByName: () => principal,
    patchPrincipal: () => { patchedPrincipal = true },
    setDomainCatchAllAddress: () => {},
    ensureSetting: () => {},
}))
mock.module('../src/utils/mail/system.ts', () => ({
    systemSenderAccess: () => ({ username: 'noreply', address: 'noreply@example.test', password: 'test-secret' }),
}))

const { getMailAccess, listAccessibleMailAccounts } = await import('../src/utils/mail/accounts.ts')
const { provisionSharedMailboxes } = await import('../src/utils/mail/shared.ts')

test('personal users cannot enumerate or open shared mailboxes or another user mailbox', async () => {
    internalMember = false
    mailboxReads = 0
    expect((await listAccessibleMailAccounts('member')).map(account => account.id)).toEqual(['member'])
    for (const mailbox of ['shared:postmaster', 'shared:security', 'shared:support', 'someone-else']) {
        await expect(getMailAccess('member', mailbox)).rejects.toThrow('do not have access')
    }
    expect(mailboxReads).toBe(0)
})

test('internal editors can access shared mailboxes while direct customer mailbox access stays denied', async () => {
    internalMember = true
    expect((await listAccessibleMailAccounts('member')).filter(account => account.shared).map(account => account.id)).toEqual([
        'shared:support', 'shared:sales', 'shared:postmaster', 'shared:security', 'shared:noreply',
    ])
    expect(await getMailAccess('member', 'shared:support')).toMatchObject({ targetUser: 'shared:support', address: 'support@example.test', canSend: true })
    expect(await getMailAccess('member', 'shared:noreply')).toMatchObject({ canSend: true })
    await expect(getMailAccess('member', 'someone-else')).rejects.toThrow('do not have access')
    internalMember = false
    await expect(getMailAccess('member', 'shared:support')).rejects.toThrow('do not have access')
})

test('links an existing shared Stalwart account without changing its credential', async () => {
    sharedAccountRow = null
    principal = { name: 'support', emails: ['support@example.test'], secrets: ['existing-secret'] }
    insertedSharedAccount = null
    patchedPrincipal = false
    createdPrincipal = null

    await provisionSharedMailboxes(['shared:support'])

    expect(insertedSharedAccount).toEqual(['shared:support', 'support', 'support@example.test', 'enc:existing-secret'])
    expect(patchedPrincipal).toBe(false)
})

test('does not invent a credential when an existing shared account cannot reveal one', async () => {
    sharedAccountRow = null
    principal = { name: 'support', emails: ['support@example.test'] }
    insertedSharedAccount = null
    patchedPrincipal = false
    createdPrincipal = null

    await expect(provisionSharedMailboxes(['shared:support'])).rejects.toThrow('no recoverable credential')
    expect(insertedSharedAccount).toBe(null)
    expect(patchedPrincipal).toBe(false)
})

test('creates a missing shared mailbox and stores the same generated credential', async () => {
    sharedAccountRow = null
    principal = null
    insertedSharedAccount = null
    createdPrincipal = null

    await provisionSharedMailboxes(['shared:support'])

    expect(insertedSharedAccount).toEqual(['shared:support', 'support', 'support@example.test', 'enc:test-secret'])
    expect(createdPrincipal).toMatchObject({ name: 'support', secrets: ['test-secret'], emails: ['support@example.test'] })
})
