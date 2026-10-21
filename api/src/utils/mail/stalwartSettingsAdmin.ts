import { adminFetch, isLegacyAdminRouteMissing, isMissingRequiredSystemSettings } from './stalwartAdminRequest.ts'
import { jmapAdminCall } from './stalwartJmapAdmin.ts'

export async function ensureSetting(key: string, value: string | boolean | number) {
    try {
        await adminFetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify([{ type: 'set', key, value }]),
        })
        return
    } catch (error) {
        if (!isLegacyAdminRouteMissing(error)) throw error
    }

    if (key === 'server.hostname') {
        await jmapAdminCall('x:SystemSettings/set', {
            update: { singleton: { defaultHostname: String(value) } },
        }).catch(error => {
            if (!isMissingRequiredSystemSettings(error)) throw error
        })
    }
}

export async function fetchRecommendedDns(domain: string) {
    const response = await adminFetch(`/api/dns/records/${domain}`)
    return response.json()
}
