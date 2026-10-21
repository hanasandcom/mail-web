import { createHash } from 'node:crypto'
import run from '#db'

const VT_BASE = 'https://www.virustotal.com/api/v3'
const REQUEST_TIMEOUT_MS = 3500
const KNOWN_TTL_MS = 24 * 60 * 60 * 1000
const UNKNOWN_TTL_MS = 60 * 60 * 1000
const MAX_URLS_PER_MESSAGE = 50

export type UrlReputation = {
    provider: 'virustotal'
    status: 'known' | 'unknown' | 'unavailable'
    flagged?: number
    total?: number
    checkedAt?: string
    reportUrl?: string
}

export type CanonicalRemoteUrl = { id: string, url: string }

export async function cachedAttachmentSha256(mailboxUser: string, blobId: string) {
    const result = await run('SELECT sha256 FROM mail_attachment_hash_cache WHERE mailbox_user = $1 AND blob_id = $2', [mailboxUser, blobId])
    const sha256 = String((result.rows[0] as { sha256?: string } | undefined)?.sha256 || '').trim()
    return /^[a-f0-9]{64}$/.test(sha256) ? sha256 : null
}

export async function cacheAttachmentSha256(mailboxUser: string, blobId: string, sha256: string) {
    if (!/^[a-f0-9]{64}$/.test(sha256)) return
    await run(`INSERT INTO mail_attachment_hash_cache (mailbox_user, blob_id, sha256)
        VALUES ($1, $2, $3) ON CONFLICT (mailbox_user, blob_id) DO UPDATE SET sha256 = EXCLUDED.sha256, checked_at = NOW()`,
    [mailboxUser, blobId, sha256])
}

export function canonicalRemoteUrl(value: string): CanonicalRemoteUrl | null {
    try {
        const url = new URL(value)
        if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) return null
        url.hash = ''
        const canonical = url.href
        return { id: createHash('sha256').update(canonical).digest('hex'), url: canonical }
    } catch {
        return null
    }
}

export function extractRemoteUrls(html: string): CanonicalRemoteUrl[] {
    const results = new Map<string, CanonicalRemoteUrl>()
    const attr = /\b(?:src|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi
    for (const match of html.matchAll(attr)) {
        const raw = (match[1] ?? match[2] ?? match[3] ?? '').trim()
        if (!raw || raw.startsWith('cid:') || raw.startsWith('data:')) continue
        const canonical = canonicalRemoteUrl(raw)
        if (canonical) results.set(canonical.id, canonical)
        if (results.size >= MAX_URLS_PER_MESSAGE) break
    }
    return [...results.values()]
}

export async function lookupUrlReputation(url: CanonicalRemoteUrl): Promise<UrlReputation> {
    const vtId = Buffer.from(url.url).toString('base64url')
    const reportUrl = `https://www.virustotal.com/gui/url/${vtId}`
    const cached = await run('SELECT status, flagged, total, report_url, checked_at FROM mail_reputation_cache WHERE resource_type = $1 AND resource_hash = $2 AND expires_at > NOW()', ['url', url.id])
    if (cached.rows[0]) {
        const row = cached.rows[0] as { status: 'known' | 'unknown', flagged: number | null, total: number | null, report_url: string, checked_at: Date | string }
        return {
            provider: 'virustotal', status: row.status,
            ...(row.flagged === null ? {} : { flagged: Number(row.flagged) }),
            ...(row.total === null ? {} : { total: Number(row.total) }),
            checkedAt: new Date(row.checked_at).toISOString(), reportUrl: row.report_url,
        }
    }

    const apiKey = process.env.VIRUSTOTAL_API_KEY
    if (!apiKey) return { provider: 'virustotal', status: 'unavailable' }

    try {
        const response = await fetch(`${VT_BASE}/urls/${vtId}`, {
            headers: { 'x-apikey': apiKey, accept: 'application/json' },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
        if (response.status === 404) return await cacheUrlVerdict('url', url.id, { status: 'unknown', reportUrl })
        if (!response.ok) return { provider: 'virustotal', status: 'unavailable' }
        const payload = await response.json() as VirusTotalUrlResponse
        if (payload.data?.type !== 'url' || payload.data.id !== vtId) return { provider: 'virustotal', status: 'unavailable' }
        const stats = payload.data.attributes?.last_analysis_stats
        if (!stats || !Object.values(stats).every(value => Number.isFinite(value) && value >= 0)) return { provider: 'virustotal', status: 'unavailable' }
        const flagged = Number(stats.malicious || 0) + Number(stats.suspicious || 0)
        const total = Object.values(stats).reduce((sum, value) => sum + Number(value), 0)
        return await cacheUrlVerdict('url', url.id, { status: 'known', flagged, total, reportUrl })
    } catch {
        return { provider: 'virustotal', status: 'unavailable' }
    }
}

export async function lookupFileHashReputation(sha256: string): Promise<UrlReputation> {
    if (!/^[a-f0-9]{64}$/.test(sha256)) return { provider: 'virustotal', status: 'unavailable' }
    const reportUrl = `https://www.virustotal.com/gui/file/${sha256}`
    const cached = await run('SELECT status, flagged, total, report_url, checked_at FROM mail_reputation_cache WHERE resource_type = $1 AND resource_hash = $2 AND expires_at > NOW()', ['file', sha256])
    if (cached.rows[0]) {
        const row = cached.rows[0] as { status: 'known' | 'unknown', flagged: number | null, total: number | null, report_url: string, checked_at: Date | string }
        return {
            provider: 'virustotal', status: row.status,
            ...(row.flagged === null ? {} : { flagged: Number(row.flagged) }),
            ...(row.total === null ? {} : { total: Number(row.total) }),
            checkedAt: new Date(row.checked_at).toISOString(), reportUrl: row.report_url,
        }
    }
    const apiKey = process.env.VIRUSTOTAL_API_KEY
    if (!apiKey) return { provider: 'virustotal', status: 'unavailable' }
    try {
        const response = await fetch(`${VT_BASE}/files/${sha256}`, {
            headers: { 'x-apikey': apiKey, accept: 'application/json' },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
        if (response.status === 404) return await cacheUrlVerdict('file', sha256, { status: 'unknown', reportUrl })
        if (!response.ok) return { provider: 'virustotal', status: 'unavailable' }
        const payload = await response.json() as VirusTotalUrlResponse
        if (payload.data?.type !== 'file' || payload.data.id !== sha256) return { provider: 'virustotal', status: 'unavailable' }
        const stats = payload.data.attributes?.last_analysis_stats
        if (!stats || !Object.values(stats).every(value => Number.isFinite(value) && value >= 0)) return { provider: 'virustotal', status: 'unavailable' }
        const flagged = Number(stats.malicious || 0) + Number(stats.suspicious || 0)
        const total = Object.values(stats).reduce((sum, value) => sum + Number(value), 0)
        return await cacheUrlVerdict('file', sha256, { status: 'known', flagged, total, reportUrl })
    } catch {
        return { provider: 'virustotal', status: 'unavailable' }
    }
}

async function cacheUrlVerdict(resourceType: 'url' | 'file', resourceHash: string, verdict: { status: 'known' | 'unknown', flagged?: number, total?: number, reportUrl: string }): Promise<UrlReputation> {
    const checkedAt = new Date()
    const ttl = verdict.status === 'known' ? KNOWN_TTL_MS : UNKNOWN_TTL_MS
    await run(`INSERT INTO mail_reputation_cache (resource_type, resource_hash, status, flagged, total, report_url, checked_at, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (resource_type, resource_hash) DO UPDATE SET status = EXCLUDED.status, flagged = EXCLUDED.flagged,
            total = EXCLUDED.total, report_url = EXCLUDED.report_url, checked_at = EXCLUDED.checked_at, expires_at = EXCLUDED.expires_at`,
    [resourceType, resourceHash, verdict.status, verdict.flagged ?? null, verdict.total ?? null, verdict.reportUrl, checkedAt, new Date(checkedAt.getTime() + ttl)])
    return {
        provider: 'virustotal', status: verdict.status,
        ...(verdict.flagged === undefined ? {} : { flagged: verdict.flagged }),
        ...(verdict.total === undefined ? {} : { total: verdict.total }),
        checkedAt: checkedAt.toISOString(), reportUrl: verdict.reportUrl,
    }
}

type VirusTotalUrlResponse = {
    data?: { type?: string, id?: string, attributes?: { last_analysis_stats?: Record<string, number> } }
}
