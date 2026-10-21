import { adminFetch, isLegacyAdminRouteMissing } from './stalwartAdminRequest.ts'
import { jmapAdminCall } from './stalwartJmapAdmin.ts'

export async function fetchMailQueueSummary() {
    try {
        const response = await adminFetch('/api/queue/messages')
        return response.json() as Promise<{ data?: { items?: unknown[], total?: number, status?: boolean } }>
    } catch (error) {
        if (!isLegacyAdminRouteMissing(error)) throw error
    }

    const query = await jmapAdminCall<{ ids?: string[], total?: number }>('x:QueuedMessage/query', {
        filter: {},
        limit: 50,
    })
    return {
        data: {
            items: query.ids || [],
            total: query.total || query.ids?.length || 0,
            status: true,
        },
    }
}
