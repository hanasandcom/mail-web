import { adminFetch, isLegacyAdminRouteMissing } from './stalwartAdminRequest.ts'
import { jmapAdminCall } from './stalwartJmapAdmin.ts'
import { createAccountPrincipal, createDomainPrincipal, findAccountPrincipalByName, findDomainPrincipalByName, listAccountPrincipals, listDomainPrincipals } from './stalwartPrincipalJmap.ts'
import { mapAccountPatch } from './stalwartPrincipalMapping.ts'
import type { AdminPatch, PrincipalRecord } from './stalwartAdminTypes.ts'

export async function listPrincipals(types?: string[]) {
    try {
        const query = new URLSearchParams({ limit: '500' })
        if (types?.length) query.set('types', types.join(','))

        const response = await adminFetch(`/api/principal?${query.toString()}`)
        const payload = await response.json() as { data?: { items?: PrincipalRecord[] } }
        return payload.data?.items || []
    } catch (error) {
        if (!isLegacyAdminRouteMissing(error)) throw error
    }

    const records: PrincipalRecord[] = []
    if (!types?.length || types.includes('domain')) records.push(...await listDomainPrincipals())
    if (!types?.length || types.includes('individual')) records.push(...await listAccountPrincipals())
    return records
}

export async function deleteMailPrincipal(name: string) {
    const principal = await findPrincipalByName(name, 'individual')
    if (!principal) return
    try {
        await adminFetch(`/api/principal/${encodeURIComponent(name)}`, { method: 'DELETE' })
    } catch (error) {
        if (!isLegacyAdminRouteMissing(error)) throw error
        await jmapAdminCall('x:Account/set', { destroy: [String(principal.id)] })
    }
}

export async function findPrincipalByName(name: string, type?: string) {
    try {
        const response = await adminFetch(`/api/principal/${encodeURIComponent(name)}`)
        const payload = await response.json() as { data?: PrincipalRecord | null }
        const principal = payload.data || null
        if (!principal || (type && principal.type !== type)) return null
        return principal
    } catch (error) {
        if (error instanceof Error && error.message.includes('notFound')) return null
        if (!isLegacyAdminRouteMissing(error)) throw error
    }

    if (type === 'domain') return findDomainPrincipalByName(name)
    if (type === 'individual') return findAccountPrincipalByName(name)
    return (await findDomainPrincipalByName(name)) || await findAccountPrincipalByName(name)
}

export async function createPrincipal(body: Record<string, unknown>) {
    try {
        const response = await adminFetch('/api/principal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })
        const payload = await response.json() as { data?: number }
        return payload.data || null
    } catch (error) {
        if (!isLegacyAdminRouteMissing(error)) throw error
    }

    if (body.type === 'domain') return (await createDomainPrincipal(body))?.id || null
    if (body.type === 'individual') return (await createAccountPrincipal(body))?.id || null
    throw new Error(`Unsupported Stalwart principal type: ${String(body.type || 'unknown')}`)
}

export async function setDomainCatchAllAddress(domainName: string, address: string) {
    const domain = await findDomainPrincipalByName(domainName)
    if (!domain) throw new Error(`Mail domain ${domainName} was not found.`)
    if (domain.catchAllAddress === address) return
    await jmapAdminCall('x:Domain/set', {
        update: { [String(domain.id)]: { catchAllAddress: address } },
    })
}

export async function patchPrincipal(principalName: string, patches: AdminPatch[]) {
    if (!patches.length) return
    try {
        await adminFetch(`/api/principal/${encodeURIComponent(principalName)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patches),
        })
        return
    } catch (error) {
        if (!isLegacyAdminRouteMissing(error)) throw error
    }

    const principal = await findAccountPrincipalByName(principalName)
    if (!principal) throw new Error(`Mail account ${principalName} was not found.`)

    const update: Record<string, unknown> = {}
    for (const patch of patches) {
        if (patch.action === 'set') {
            Object.assign(update, mapAccountPatch(principal, patch.field, patch.value))
        } else if (patch.action === 'addItem') {
            const values = [...new Set([...(principal.emails || []), String(patch.value)])]
            Object.assign(update, mapAccountPatch(principal, patch.field, values))
        } else {
            const values = (principal.emails || []).filter(value => value !== patch.value)
            Object.assign(update, mapAccountPatch(principal, patch.field, values))
        }
    }

    if (Object.keys(update).length) {
        await jmapAdminCall('x:Account/set', { update: { [String(principal.id)]: update } })
    }
}
