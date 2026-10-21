import { authHeaders, getMailSession, JMAP_TIMEOUT_MS, toMailServiceUrl } from './jmapSession.ts'

export async function uploadAttachment(username: string, password: string, filename: string, type: string, contentBase64: string) {
    const { session, accountId } = await getMailSession(username, password)
    const formData = new FormData()
    const bytes = Buffer.from(contentBase64, 'base64')
    formData.set('file', new Blob([bytes], { type }), filename)

    const response = await fetch(toMailServiceUrl(session.uploadUrl.replace('{accountId}', accountId)), {
        method: 'POST',
        headers: authHeaders(username, password),
        body: formData,
        signal: AbortSignal.timeout(JMAP_TIMEOUT_MS),
    })

    if (!response.ok) {
        throw new Error(`Attachment upload failed (${response.status}).`)
    }

    return response.json() as Promise<{ blobId: string, size: number, type: string }>
}

export async function downloadBlob(username: string, password: string, blobId: string, name: string) {
    const { session, accountId } = await getMailSession(username, password)
    return downloadBlobWithSession(username, password, session, accountId, blobId, name)
}

export async function downloadBlobWithSession(username: string, password: string, session: Awaited<ReturnType<typeof getMailSession>>['session'], accountId: string, blobId: string, name: string) {
    const url = session.downloadUrl
        .replace('{accountId}', accountId)
        .replace('{blobId}', encodeURIComponent(blobId))
        .replace('{name}', encodeURIComponent(name))
        .replace('{type}', '*/*')

    const response = await fetch(toMailServiceUrl(url), {
        headers: authHeaders(username, password),
        signal: AbortSignal.timeout(JMAP_TIMEOUT_MS),
    })
    if (!response.ok) {
        throw new Error(`Unable to fetch blob (${response.status}).`)
    }

    return response
}
