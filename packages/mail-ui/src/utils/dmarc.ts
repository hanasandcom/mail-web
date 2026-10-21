import { Gunzip, Unzip, UnzipInflate } from 'fflate'

export const MAX_REPORT_BYTES = 2 * 1024 * 1024
export const MAX_ARCHIVE_BYTES = 1024 * 1024

export type DmarcReport = {
    domain: string
    reporter: string
    reportId: string
    begin: string
    end: string
    policy: string
    records: Array<{ source: string, count: number, disposition: string, dkim: string, spf: string }>
    xml: string
}

// Bound both the download and the expanded data; archive metadata alone is untrusted.
export async function readReportResponse(response: Response): Promise<Uint8Array> {
    if (!response.ok) throw new Error('The report attachment could not be loaded.')
    const reader = response.body?.getReader()
    if (!reader) throw new Error('The report attachment is empty.')
    const chunks: Uint8Array[] = []
    let size = 0
    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            size += value.length
            if (size > MAX_ARCHIVE_BYTES) throw new Error('This report is too large to preview. Download the attachment to read it.')
            chunks.push(value)
        }
    } finally { await reader.cancel() }
    return join(chunks, size)
}

export function extractReportXml(data: Uint8Array): string[] {
    if (data.length > MAX_ARCHIVE_BYTES) throw new Error('This report is too large to preview.')
    let expanded = 0
    const documents: string[] = []
    function collector() {
        const chunks: Uint8Array[] = []
        let size = 0
        return (chunk: Uint8Array, final: boolean) => {
            expanded += chunk.length
            size += chunk.length
            if (expanded > MAX_REPORT_BYTES) throw new Error('This report is too large to preview.')
            chunks.push(chunk)
            if (final) documents.push(new TextDecoder('utf-8', { fatal: true }).decode(join(chunks, size)))
        }
    }
    if (data[0] === 0x50 && data[1] === 0x4b) {
        let files = 0
        const archive = new Unzip(file => {
            if (++files > 16) throw new Error('This archive contains too many files to preview.')
            if (!/\.xml$/i.test(file.name)) return
            if (file.originalSize != null && file.originalSize > MAX_REPORT_BYTES) throw new Error('This report is too large to preview.')
            const collect = collector()
            file.ondata = (error, chunk, final) => {
                if (error) throw error
                collect(chunk, final)
            }
            file.start()
        })
        archive.register(UnzipInflate)
        for (let i = 0; i < data.length; i += 1024) archive.push(data.subarray(i, i + 1024), i + 1024 >= data.length)
    } else if (data[0] === 0x1f && data[1] === 0x8b) {
        const stream = new Gunzip(collector())
        for (let i = 0; i < data.length; i += 1024) stream.push(data.subarray(i, i + 1024), i + 1024 >= data.length)
    } else {
        documents.push(new TextDecoder('utf-8', { fatal: true }).decode(data))
    }
    if (!documents.length) throw new Error('No XML report was found in this attachment.')
    return documents
}

export function parseDmarcReport(xml: string): DmarcReport {
    // Reports need no DTDs or custom entities. Never resolve external document content.
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('This report contains unsupported XML declarations.')
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'feedback') throw new Error('This attachment is not a valid DMARC report.')
    const child = (node: Element, name: string) => Array.from(node.children).find(el => el.localName === name)
    const text = (node: Element, ...path: string[]): string => {
        let current: Element | undefined = node
        for (const name of path) current = current && child(current, name)
        return current?.textContent?.trim() || ''
    }
    const root = doc.documentElement
    const domain = text(root, 'policy_published', 'domain')
    const reporter = text(root, 'report_metadata', 'org_name')
    if (!domain || !reporter) throw new Error('This report is missing its domain or reporting organization.')
    const records = Array.from(root.children).filter(el => el.localName === 'record').map(record => {
        const rawCount = text(record, 'row', 'count')
        const count = Number(rawCount)
        if (!/^\d+$/.test(rawCount) || !Number.isSafeInteger(count) || count < 1) throw new Error('This report contains an invalid message count.')
        return { source: text(record, 'row', 'source_ip') || 'Unknown', count,
            disposition: text(record, 'row', 'policy_evaluated', 'disposition') || 'Unknown',
            dkim: text(record, 'row', 'policy_evaluated', 'dkim') || 'Unknown',
            spf: text(record, 'row', 'policy_evaluated', 'spf') || 'Unknown' }
    })
    if (!records.length || !Number.isSafeInteger(records.reduce((sum, row) => sum + row.count, 0))) throw new Error('This report has no valid message records.')
    return { domain, reporter, reportId: text(root, 'report_metadata', 'report_id'),
        begin: text(root, 'report_metadata', 'date_range', 'begin'), end: text(root, 'report_metadata', 'date_range', 'end'),
        policy: text(root, 'policy_published', 'p') || 'Unknown', records, xml }
}

function join(chunks: Uint8Array[], size: number) {
    const result = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length }
    return result
}
