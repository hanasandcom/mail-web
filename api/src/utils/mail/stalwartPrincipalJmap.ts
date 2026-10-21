import { mailConfig } from './config.ts'
import { jmapAdminCall } from './stalwartJmapAdmin.ts'
import { accountProperties, toAccountPrincipal, toDomainPrincipal } from './stalwartPrincipalMapping.ts'
import { addressesToLocalParts, aliasesForLocalParts, passwordCredentials, toStringArray } from './stalwartPrincipalValues.ts'

export async function listDomainPrincipals() {
    return (await queryObjects<Record<string, unknown>>('x:Domain', {}, ['id', 'name', 'description', 'catchAllAddress']))
        .map(toDomainPrincipal)
}

export async function listAccountPrincipals() {
    return (await queryObjects<Record<string, unknown>>('x:Account', { '@type': 'User' }, accountProperties()))
        .map(toAccountPrincipal)
}

export async function findDomainPrincipalByName(name: string) {
    const records = await queryObjects<Record<string, unknown>>('x:Domain', { name }, ['id', 'name', 'description', 'catchAllAddress'])
    const record = records.find(item => item.name === name)
    return record ? toDomainPrincipal(record) : null
}

export async function findAccountPrincipalByName(name: string) {
    const records = await queryObjects<Record<string, unknown>>('x:Account', { name }, accountProperties())
    const record = records.find(item => item.name === name && item['@type'] === 'User')
    return record ? toAccountPrincipal(record) : null
}

export async function createDomainPrincipal(body: Record<string, unknown>) {
    const createId = `domain-${Date.now()}`
    const response = await jmapAdminCall<{ created?: Record<string, { id: string }> }>('x:Domain/set', {
        create: {
            [createId]: {
                aliases: {},
                certificateManagement: { '@type': 'Manual' },
                dkimManagement: { '@type': 'Automatic' },
                dnsManagement: { '@type': 'Manual' },
                name: String(body.name),
                description: body.description || null,
                catchAllAddress: body.catchAllAddress || `support@${mailConfig.domain}`,
                subAddressing: { '@type': 'Enabled' },
            },
        },
    })
    const id = response.created?.[createId]?.id
    return id ? { id, name: String(body.name), type: 'domain' } : null
}

export async function createAccountPrincipal(body: Record<string, unknown>) {
    const domain = await findDomainPrincipalByName(mailConfig.domain) || await createDomainPrincipal({
        name: mailConfig.domain,
        description: 'Hanasand mail domain',
    })
    if (!domain) throw new Error(`Unable to create or locate mail domain ${mailConfig.domain}.`)

    const primaryName = String(body.name)
    const localParts = addressesToLocalParts(toStringArray(body.emails))
    const createId = `account-${Date.now()}`
    const response = await jmapAdminCall<{ created?: Record<string, { id: string }> }>('x:Account/set', {
        create: {
            [createId]: {
                '@type': 'User',
                aliases: aliasesForLocalParts(localParts.filter(part => part !== primaryName), String(domain.id)),
                credentials: passwordCredentials(toStringArray(body.secrets)[0] || ''),
                description: body.description || null,
                domainId: String(domain.id),
                encryptionAtRest: { '@type': 'Disabled' },
                memberGroupIds: {},
                name: primaryName,
                permissions: { '@type': 'Inherit' },
                quotas: {},
                roles: { '@type': 'User' },
            },
        },
    })
    const id = response.created?.[createId]?.id
    return id ? { id, name: primaryName, type: 'individual' } : null
}

async function queryObjects<T extends Record<string, unknown>>(objectName: string, filter: Record<string, unknown>, properties: string[]) {
    const query = await jmapAdminCall<{ ids?: string[] }>(`${objectName}/query`, { filter, limit: 500 })
    const ids = query.ids || []
    if (!ids.length) return []
    const response = await jmapAdminCall<{ list?: T[] }>(`${objectName}/get`, { ids, properties })
    return response.list || []
}
