import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useMailUiApi, type MailDraftAttachment } from '../api'
import type { MailAttachment, MailMessage, MailReputation } from '../types'
import { prettyBytes } from './mailFormatting'

export async function fileToDraftAttachment(file: File): Promise<MailDraftAttachment> {
    const buffer = await file.arrayBuffer()
    return {
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        contentBase64: arrayBufferToBase64(buffer),
    }
}

export function AttachmentPreview({ attachment, mailboxUser, reputation, checking }: { attachment: MailAttachment, mailboxUser: string, reputation?: MailReputation, checking: boolean }) {
    const api = useMailUiApi()
    const [url, setUrl] = useState('')
    const [error, setError] = useState(false)
    const allowedByReputation = !checking && Boolean(reputation && reputation.status !== 'unavailable' && (reputation.status === 'unknown' || (reputation.flagged ?? 0) === 0))
    useEffect(() => {
        const controller = new AbortController()
        let objectUrl = ''
        setUrl('')
        setError(false)
        if (!allowedByReputation) return () => controller.abort()
        void api.fetchMailBlob(mailboxUser, attachment.blobId, attachment.name, controller.signal)
            .then(response => response.blob())
            .then(blob => {
                if (controller.signal.aborted) return
                objectUrl = URL.createObjectURL(blob)
                setUrl(objectUrl)
            })
            .catch(() => { if (!controller.signal.aborted) setError(true) })
        return () => {
            controller.abort()
            if (objectUrl) URL.revokeObjectURL(objectUrl)
        }
    }, [api, mailboxUser, attachment.blobId, attachment.name, allowedByReputation])

    const blockedMessage = checking
        ? 'Checking VirusTotal…'
        : !reputation || reputation.status === 'unavailable'
            ? 'VirusTotal status unavailable; download blocked.'
            : reputation.status === 'known' && (reputation.flagged ?? 0) > 0
                ? 'Download blocked because VirusTotal found a potential threat.'
                : 'Loading attachment…'

    if (inlineAttachmentTypes.has(attachment.type.split(';', 1)[0].trim().toLowerCase())) {
        return (
            <div className='rounded-lg border border-ui-border bg-ui-raised p-2.5'>
                {url ? <a href={url} target='_blank' rel='noopener noreferrer'><Image src={url} unoptimized alt={attachment.name} className='h-36 w-full rounded-lg object-cover' /></a> : <div className='flex h-36 items-center justify-center text-xs text-ui-muted'>{error ? 'Unable to load image.' : blockedMessage}</div>}
                <p className='mt-2 truncate text-[11px] font-medium text-ui-text'>{attachment.name}</p>
            </div>
        )
    }

    return (
        <a href={allowedByReputation ? url || undefined : undefined} download={attachment.name} aria-disabled={!url || !allowedByReputation} onClick={event => { if (!url || !allowedByReputation) event.preventDefault() }} className='rounded-lg border border-ui-border bg-ui-raised p-2.5 text-[11px] text-ui-muted transition hover:bg-ui-panel'>
            <p className='truncate font-medium text-ui-text'>{attachment.name}</p>
            <p className='mt-1 text-[10px] text-ui-muted'>{error ? 'Unable to load attachment.' : !allowedByReputation ? blockedMessage : !url ? 'Loading attachment…' : `${attachment.type} • ${prettyBytes(attachment.size)}`}</p>
        </a>
    )
}

const inlineAttachmentTypes = new Set([
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/webp',
])

export function isInlineAttachmentType(value: string) {
    return inlineAttachmentTypes.has(value.split(';', 1)[0].trim().toLowerCase())
}

export function withInlineAttachments(message: MailMessage, _mailboxUser: string, blobUrls: Record<string, string> = {}) {
    let html = message.htmlBody
    for (const attachment of message.attachments) {
        if (attachment.cid) {
            const url = isInlineAttachmentType(attachment.type) ? blobUrls[attachment.blobId] || '' : ''
            html = html.replaceAll(`cid:${attachment.cid}`, url)
            html = html.replaceAll(`cid:<${attachment.cid}>`, url)
        }
    }

    return html
}

export function arrayBufferToBase64(buffer: ArrayBuffer) {
    let binary = ''
    const bytes = new Uint8Array(buffer)
    const chunkSize = 0x8000
    for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
    }
    return btoa(binary)
}
