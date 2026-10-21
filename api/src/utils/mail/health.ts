import type { MailHealth, MailHealthCheck } from './types.ts'
import { mailConfig } from './config.ts'
import { fetchMailQueueSummary } from './stalwartAdmin.ts'
import {
    hasValidMtaSts,
    inspectImplicitTls,
    measureSmtpBannerLatency,
    normalizeDnsName,
    resolveDnsWithResolvers,
    resolveTxtReliably,
    safeFetchText,
} from './healthProbes.ts'

export async function getMailHealth(): Promise<MailHealth> {
    const checkedAt = new Date().toISOString()
    const checks: MailHealthCheck[] = []
    let queueDepth: number
    const internalMailHost = new URL(mailConfig.internalUrl).hostname

    const hostRecords = await resolveDnsWithResolvers(mailConfig.host, 'A')
    const primaryIp = hostRecords[0] || null
    const reverseRecords = primaryIp ? await resolveDnsWithResolvers(primaryIp, 'PTR') : []
    const ptrMatches = reverseRecords.some(value => normalizeDnsName(value) === normalizeDnsName(mailConfig.host))

    checks.push({
        id: 'ptr',
        label: 'Reverse DNS',
        status: primaryIp && ptrMatches ? 'healthy' : 'error',
        detail: primaryIp
            ? `${primaryIp} -> ${reverseRecords[0] || 'missing'}`
            : 'No A record found for the mail host.',
    })

    const spf = await resolveTxtReliably(mailConfig.domain)
    const dmarc = await resolveTxtReliably(`_dmarc.${mailConfig.domain}`)
    const mtaStsTxt = await resolveTxtReliably(`_mta-sts.${mailConfig.domain}`)
    const tlsRpt = await resolveTxtReliably(`_smtp._tls.${mailConfig.domain}`)
    const mtaStsPolicy = await safeFetchText(`https://mta-sts.${mailConfig.domain}/.well-known/mta-sts.txt`)

    checks.push({
        id: 'spf',
        label: 'SPF',
        status: spf.some(value => value.startsWith('v=spf1')) ? 'healthy' : 'warning',
        detail: spf[0] || 'Missing SPF TXT record.',
    })
    checks.push({
        id: 'dmarc',
        label: 'DMARC',
        status: dmarc.some(value => value.startsWith('v=DMARC1')) ? 'healthy' : 'warning',
        detail: dmarc[0] || 'Missing DMARC TXT record.',
    })
    checks.push({
        id: 'mta-sts',
        label: 'MTA-STS',
        status: hasValidMtaSts(mtaStsTxt, mtaStsPolicy) ? 'healthy' : 'warning',
        detail: mtaStsTxt[0] || 'Missing MTA-STS TXT record.',
    })
    checks.push({
        id: 'tlsrpt',
        label: 'TLS-RPT',
        status: tlsRpt.some(value => value.startsWith('v=TLSRPTv1')) ? 'healthy' : 'warning',
        detail: tlsRpt[0] || 'Missing TLS reporting TXT record.',
    })

    const smtpBannerLatencyMs = await measureSmtpBannerLatency(internalMailHost, 25)
    checks.push({
        id: 'smtp-banner',
        label: 'SMTP banner',
        status: smtpBannerLatencyMs !== null && smtpBannerLatencyMs < 2000 ? 'healthy' : 'warning',
        detail: smtpBannerLatencyMs === null ? 'Unable to measure port 25 greeting.' : `${smtpBannerLatencyMs}ms`,
    })

    const certificateInfo = await inspectImplicitTls(internalMailHost, mailConfig.imapPort, mailConfig.host)
    checks.push({
        id: 'tls-cert',
        label: 'TLS certificate',
        status: certificateInfo.status,
        detail: certificateInfo.detail,
    })

    try {
        const queue = await fetchMailQueueSummary()
        queueDepth = queue.data?.total || 0
    } catch {
        queueDepth = -1
    }

    checks.push({
        id: 'queue',
        label: 'Queue depth',
        status: queueDepth === 0 ? 'healthy' : queueDepth > 0 ? 'warning' : 'warning',
        detail: queueDepth >= 0 ? `${queueDepth} queued message(s)` : 'Unable to query the outbound queue.',
    })

    return {
        status: summarize(checks),
        checkedAt,
        queueDepth: Math.max(queueDepth, 0),
        smtpBannerLatencyMs,
        checks,
    }
}

function summarize(checks: MailHealthCheck[]): MailHealth['status'] {
    if (checks.some(check => check.status === 'error')) {
        return 'error'
    }

    if (checks.some(check => check.status === 'warning')) {
        return 'warning'
    }

    return 'healthy'
}
