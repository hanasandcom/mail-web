'use client'

import { useEffect, useState } from 'react'
import { useMailUiApi } from '../api'
import { extractReportXml, parseDmarcReport, readReportResponse, MAX_ARCHIVE_BYTES, type DmarcReport } from '../utils/dmarc'
import type { MailAttachment, MailMessage, MailReputation } from '../types'

export function reportAttachments(message: MailMessage) {
    const isReport = /dmarc|report domain:/i.test(message.subject) || message.from.some(address => /dmarc/i.test(address.email))
    return isReport ? message.attachments.filter(attachment => /\.(?:zip|gz|xml)$/i.test(attachment.name)) : []
}

export default function DmarcReportPreview({ attachment, mailboxUser, reputation, checking }: { attachment: MailAttachment, mailboxUser: string, reputation?: MailReputation, checking: boolean }) {
    const api = useMailUiApi()
    const [reports, setReports] = useState<DmarcReport[]>([])
    const [error, setError] = useState('')
    const [attempt, setAttempt] = useState(0)
    useEffect(() => {
        const controller = new AbortController()
        setReports([])
        setError('')
        if (attachment.size > MAX_ARCHIVE_BYTES) {
            setError('This report is too large to preview. Download the attachment to read it.')
            return
        }
        const safeToRead = !checking && reputation && reputation.status !== 'unavailable' && (reputation.status === 'unknown' || (reputation.flagged ?? 0) === 0)
        if (!safeToRead) {
            setError(checking ? 'Checking VirusTotal before loading this report.' : 'VirusTotal could not confirm this report is clear, so it remains blocked.')
            return
        }
        const timer = setTimeout(() => controller.abort(), 20_000)
        void api.fetchMailBlob(mailboxUser, attachment.blobId, attachment.name, controller.signal)
            .then(readReportResponse)
            .then(data => extractReportXml(data).map(parseDmarcReport))
            .then(result => { if (!controller.signal.aborted) setReports(result) })
            .catch(cause => {
                if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to read this report.')
                else if (controller.signal.reason?.name === 'AbortError') setError('The report took too long to load. Try again.')
            })
            .finally(() => clearTimeout(timer))
        return () => { clearTimeout(timer); controller.abort('Message closed') }
    }, [api, mailboxUser, attachment.blobId, attachment.name, attachment.size, attempt, reputation, checking])
    return <section aria-label={`DMARC report ${attachment.name}`} className='min-w-0 rounded-lg border border-ui-border p-4 text-sm text-ui-text'>
        {error ? <p role='status' className='text-ui-muted'>{error} <button type='button' className='text-ui-primary underline' onClick={() => setAttempt(value => value + 1)}>Retry</button></p>
            : !reports.length ? <p role='status' className='text-ui-muted'>Reading report…</p>
                : reports.map((report, index) => <Report key={index} report={report} />)}
    </section>
}

function Report({ report }: { report: DmarcReport }) {
    const [limit, setLimit] = useState(100)
    const total = report.records.reduce((sum, row) => sum + row.count, 0)
    const passed = report.records.reduce((sum, row) => sum + (row.dkim === 'pass' || row.spf === 'pass' ? row.count : 0), 0)
    return <div className='min-w-0 space-y-3 not-first:mt-6'>
        <div>
            <h3 className='font-semibold'>DMARC report · {report.domain}</h3>
            <p className='text-xs text-ui-muted'>{report.reporter} · {date(report.begin)} – {date(report.end)} · UTC</p>
        </div>
        <p><strong>{number(total)}</strong> messages · <span className='text-ui-success'>{number(passed)} passed</span> · <span className={total > passed ? 'text-ui-warning' : 'text-ui-muted'}>{number(total - passed)} did not pass</span></p>
        <p className='text-xs text-ui-muted'>DMARC passes when SPF or DKIM passes and aligns with the sender’s domain. Published policy: {report.policy}.</p>
        <div className='max-w-full overflow-x-auto'>
            <table className='w-full text-left text-xs'>
                <thead><tr className='border-b border-ui-border'>{['Sending IP', 'Messages', 'SPF alignment', 'DKIM alignment', 'Action'].map(label => <th key={label} className='px-2 py-2 font-medium whitespace-nowrap'>{label}</th>)}</tr></thead>
                <tbody>{report.records.slice(0, limit).map((row, index) => <tr key={index} className='border-b border-ui-border last:border-0'>
                    <td className='px-2 py-2 font-mono'>{row.source}</td><td className='px-2 py-2'>{number(row.count)}</td>
                    {[row.spf, row.dkim, row.disposition].map((value, column) => <td key={column} className='px-2 py-2'>{value === 'none' ? 'No DMARC action' : value}</td>)}
                </tr>)}</tbody>
            </table>
        </div>
        {report.records.length > limit && <button type='button' className='text-ui-primary underline' onClick={() => setLimit(value => value + 100)}>Show more sources ({number(report.records.length - limit)} remaining)</button>}
        <details className='text-xs text-ui-muted'><summary className='cursor-pointer'>Original XML · report {report.reportId || 'ID unavailable'}</summary><pre className='mt-2 max-h-80 overflow-auto whitespace-pre-wrap wrap-anywhere'>{report.xml}</pre></details>
    </div>
}

function number(value: number) { return new Intl.NumberFormat('nb-NO').format(value) }
function date(value: string) {
    const timestamp = Number(value) * 1000
    return value && Number.isFinite(timestamp) && Math.abs(timestamp) <= 8.64e15 ? new Date(timestamp).toISOString().slice(0, 16).replace('T', ' ') : 'Date unavailable'
}
