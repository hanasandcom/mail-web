'use client'

import { authHeaders, fetchWithTimeout, mailApiUrl } from './client.transport'

export async function fetchMailBlob(mailboxUser: string, blobId: string, name: string, signal?: AbortSignal) {
    const headers = authHeaders()
    const path = `/mail/blob/${encodeURIComponent(mailboxUser)}/${encodeURIComponent(blobId)}/${encodeURIComponent(name)}`
    const response = await fetchWithTimeout(mailApiUrl(path), { headers, signal }, 20_000)
    if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(payload.error || 'Unable to load this attachment.')
    }
    return response
}

export const fetchMailBlobResponse = fetchMailBlob
