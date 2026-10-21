import { mailConfig } from './config.ts'
import type { PrincipalRecord } from './stalwartAdminTypes.ts'
import { addressesToLocalParts, aliasesForLocalParts, passwordCredentials, toRecord, toStringArray } from './stalwartPrincipalValues.ts'

export function toDomainPrincipal(record: Record<string, unknown>): PrincipalRecord {
    return {
        id: String(record.id),
        name: String(record.name || ''),
        type: 'domain',
        description: typeof record.description === 'string' ? record.description : undefined,
        catchAllAddress: typeof record.catchAllAddress === 'string' ? record.catchAllAddress : undefined,
        raw: record,
    }
}

export function toAccountPrincipal(record: Record<string, unknown>): PrincipalRecord {
    return {
        id: String(record.id),
        name: String(record.name || ''),
        type: 'individual',
        description: typeof record.description === 'string' ? record.description : undefined,
        emails: emailsFromAccount(record),
        secrets: secretsFromAccount(record),
        roles: rolesFromAccount(record),
        domainId: typeof record.domainId === 'string' ? record.domainId : undefined,
        raw: record,
    }
}

export function mapAccountPatch(principal: PrincipalRecord, field: string, value: unknown) {
    if (field === 'description') return { description: value || null }
    if (field === 'secrets') return { credentials: passwordCredentials(toStringArray(value)[0] || '') }
    if (field === 'emails') {
        const aliases = addressesToLocalParts(toStringArray(value)).filter(part => part !== principal.name)
        return { aliases: aliasesForLocalParts(aliases, principal.domainId || '') }
    }
    return {}
}

export function accountProperties() {
    return ['id', '@type', 'name', 'description', 'emailAddress', 'aliases', 'credentials', 'roles', 'domainId']
}

function emailsFromAccount(record: Record<string, unknown>) {
    const emails = new Set<string>()
    if (typeof record.emailAddress === 'string') emails.add(record.emailAddress)
    for (const alias of Object.values(toRecord(record.aliases))) {
        if (!alias || typeof alias !== 'object') continue
        const item = alias as Record<string, unknown>
        if (typeof item.name === 'string') emails.add(`${item.name}@${mailConfig.domain}`)
    }
    return [...emails]
}

function secretsFromAccount(record: Record<string, unknown>) {
    return Object.values(toRecord(record.credentials))
        .filter(value => value && typeof value === 'object' && (value as Record<string, unknown>)['@type'] === 'Password')
        .map(value => (value as Record<string, unknown>).secret)
        .filter((value): value is string => typeof value === 'string')
}

function rolesFromAccount(record: Record<string, unknown>) {
    const type = toRecord(record.roles)['@type']
    return typeof type === 'string' ? [type.toLowerCase()] : []
}
