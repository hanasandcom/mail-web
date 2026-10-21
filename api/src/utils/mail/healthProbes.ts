import dns from 'node:dns/promises'
import net from 'node:net'
import tls from 'node:tls'
import { mailConfig } from './config.ts'

const DNS_TIMEOUT_MS = Number(process.env.MAIL_DNS_TIMEOUT_MS || 2500)
const MAIL_HEALTH_FETCH_TIMEOUT_MS = Number(process.env.MAIL_HEALTH_FETCH_TIMEOUT_MS || 3000)
const SOCKET_TIMEOUT_MS = Number(process.env.MAIL_SOCKET_TIMEOUT_MS || 2500)

export async function resolveDnsWithResolvers(name: string, type: 'A' | 'PTR') {
    const resolver = new dns.Resolver()
    resolver.setServers(['1.1.1.1', '8.8.8.8'])

    try {
        return type === 'A'
            ? await withDeadline(resolver.resolve4(name), DNS_TIMEOUT_MS, [])
            : await withDeadline(resolver.reverse(name), DNS_TIMEOUT_MS, [])
    } catch {
        return []
    }
}

export async function resolveTxtReliably(name: string) {
    const authoritative = await resolveTxtFromAuthoritative(name)
    if (authoritative.length) return authoritative

    const publicResolvers = [['1.1.1.1', '8.8.8.8'], ['9.9.9.9', '208.67.222.222']]
    for (const servers of publicResolvers) {
        try {
            const resolver = new dns.Resolver()
            resolver.setServers(servers)
            const records = await withDeadline(resolver.resolveTxt(name), DNS_TIMEOUT_MS, [])
            const values = records.map(parts => parts.join(''))
            if (values.length) return values
        } catch {
            continue
        }
    }

    return []
}

async function resolveTxtFromAuthoritative(name: string) {
    const zone = extractZone(name)
    try {
        const nsRecords = await withDeadline(dns.resolveNs(zone), DNS_TIMEOUT_MS, [])
        for (const ns of nsRecords) {
            try {
                const addresses = await withDeadline(dns.resolve4(ns), DNS_TIMEOUT_MS, [])
                for (const address of addresses) {
                    const resolver = new dns.Resolver()
                    resolver.setServers([address])
                    const records = await withDeadline(resolver.resolveTxt(name), DNS_TIMEOUT_MS, [])
                    const values = records.map(parts => parts.join(''))
                    if (values.length) return values
                }
            } catch {
                continue
            }
        }
    } catch {
        return []
    }

    return []
}

export async function safeFetchText(url: string) {
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(MAIL_HEALTH_FETCH_TIMEOUT_MS) })
        return response.ok ? await response.text() : ''
    } catch {
        return ''
    }
}

export function hasValidMtaSts(records: string[], policy: string) {
    return records.some(value => value.startsWith('v=STSv1'))
        && policy.includes('version: STSv1')
        && policy.includes(`mx: ${mailConfig.host}`)
}

export function normalizeDnsName(value: string) {
    return value.replace(/\.$/, '').toLowerCase()
}

export function measureSmtpBannerLatency(host: string, port: number) {
    return new Promise<number | null>((resolve) => {
        const startedAt = Date.now()
        const socket = net.createConnection({ host, port })
        let settled = false

        const finish = (value: number | null) => {
            if (settled) return
            settled = true
            socket.destroy()
            resolve(value)
        }

        socket.setTimeout(SOCKET_TIMEOUT_MS)
        socket.once('data', () => finish(Date.now() - startedAt))
        socket.once('timeout', () => finish(null))
        socket.once('error', () => finish(null))
    })
}

export function inspectImplicitTls(host: string, port: number, servername: string) {
    return new Promise<{ status: 'healthy' | 'warning' | 'error', detail: string }>((resolve) => {
        const socket = tls.connect({ host, port, servername, rejectUnauthorized: true }, () => {
            const certificate = socket.getPeerCertificate()
            const validTo = certificate.valid_to ? new Date(certificate.valid_to) : null
            const daysLeft = validTo ? Math.ceil((validTo.getTime() - Date.now()) / 86_400_000) : null
            socket.end()

            if (!validTo || daysLeft === null) {
                resolve({ status: 'warning', detail: 'Certificate is present, but expiry could not be determined.' })
                return
            }

            resolve({
                status: daysLeft > 14 ? 'healthy' : daysLeft > 0 ? 'warning' : 'error',
                detail: `${certificate.subject?.CN || host} expires in ${daysLeft} day(s)`,
            })
        })

        socket.setTimeout(SOCKET_TIMEOUT_MS, () => {
            socket.destroy()
            resolve({ status: 'error', detail: `Unable to complete TLS handshake on port ${port}.` })
        })
        socket.once('error', () => resolve({ status: 'error', detail: `Unable to complete TLS handshake on port ${port}.` }))
    })
}

function extractZone(name: string) {
    const parts = name.split('.')
    return parts.slice(-2).join('.')
}

function withDeadline<T>(work: Promise<T>, timeoutMs: number, fallback: T) {
    return Promise.race([work, new Promise<T>(resolve => setTimeout(() => resolve(fallback), timeoutMs))])
}
