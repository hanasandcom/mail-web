import { expect, mock, test } from 'bun:test'

mock.module('../src/utils/mail/config.ts', () => ({
    mailConfig: {
        domain: 'example.test',
        userAliases: new Map(),
        userAddresses: new Map([['ole-user-id', 'ole@example.test']]),
        systemMailboxOwner: 'system-user-id',
        systemAliasLocalParts: ['noreply'],
    },
}))

const { addressForUser, addressesForUser } = await import('../src/utils/mail/helpers.ts')

test('configured primary address keeps the previous address as an alias to the same account', () => {
    expect(addressForUser('ole-user-id')).toBe('ole@example.test')
    expect(addressesForUser('ole-user-id')).toEqual(['ole@example.test', 'ole-user-id@example.test'])
})

test('unconfigured users keep their existing address and system aliases', () => {
    expect(addressForUser('another-user')).toBe('another-user@example.test')
    expect(addressesForUser('system-user-id')).toEqual(['system-user-id@example.test', 'noreply@example.test'])
})
