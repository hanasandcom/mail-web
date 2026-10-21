'use client'

import { useEffect, useState, type ReactNode } from 'react'
import {
    Archive,
    Inbox,
    Mail,
    Trash2,
    ShieldAlert,
} from 'lucide-react'
import {
    fetchMailBlob,
    messageAction,
    type DraftAttachment,
} from '@/utils/mail/client'
import type {
    MailAddress,
    MailAttachment,
    MailMessage,
    MailOverview,
    MailReputation,
} from '@/utils/mail/types'
import Image from 'next/image'

export type ComposerMode = 'new' | 'reply' | 'replyAll' | 'forward'

export type ComposerState = {
    open: boolean
    mode: ComposerMode
    to: string
    cc: string
    bcc: string
    subject: string
    body: string
    attachments: DraftAttachment[]
}

export const emptyComposer: ComposerState = {
    open: false,
    mode: 'new',
    to: '',
    cc: '',
    bcc: '',
    subject: '',
    body: '',
    attachments: [],
}

export const toolbarButton = 'inline-flex h-8 items-center gap-1.5 rounded-lg border border-ui-border bg-ui-raised px-2.5 text-[11px] font-medium text-ui-text transition hover:border-ui-primary hover:bg-ui-panel disabled:cursor-not-allowed disabled:opacity-45'
export const iconButton = 'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-ui-border bg-ui-raised text-ui-muted transition hover:border-ui-primary hover:bg-ui-panel hover:text-ui-text disabled:cursor-not-allowed disabled:opacity-45'
export const subtleInput = 'h-8 rounded-lg border border-ui-border bg-ui-raised px-3 text-xs text-ui-text outline-none transition placeholder:text-ui-muted focus:border-ui-primary focus:bg-ui-panel'

export function composeFromReply(mode: ComposerMode, message: MailMessage, ownAddress?: string): ComposerState {
    const subject = mode === 'forward'
        ? prefixSubject(message.subject, 'Fwd:')
        : prefixSubject(message.subject, 'Re:')

    const recipients = mode === 'reply'
        ? message.replyTo.length ? message.replyTo : message.from
        : mode === 'replyAll'
            ? dedupeAddresses(
                [...(message.replyTo.length ? message.replyTo : message.from), ...message.to, ...message.cc]
                    .filter((address) => address.email.toLowerCase() !== (ownAddress || '').toLowerCase())
            )
            : []

    const quoted = `\n\nOn ${formatDate(message.receivedAt, true)}, ${message.from.map((from) => from.email).join(', ')} wrote:\n${message.textBody.split('\n').map((line) => `> ${line}`).join('\n')}`

    return {
        open: true,
        mode,
        to: recipients.map((address) => address.email).join(', '),
        cc: '',
        bcc: '',
        subject,
        body: mode === 'forward' ? `\n\n---------- Forwarded message ----------\n${message.textBody}` : quoted,
        attachments: [],
    }
}

export function prefixSubject(subject: string, prefix: string) {
    return subject.toLowerCase().startsWith(prefix.toLowerCase()) ? subject : `${prefix} ${subject}`
}

export function dedupeAddresses(addresses: MailAddress[]) {
    const seen = new Set<string>()
    return addresses.filter((address) => {
        const key = address.email.toLowerCase()
        if (seen.has(key)) {
            return false
        }
        seen.add(key)
        return true
    })
}

export async function runAction(
    messageId: string,
    overview: MailOverview,
    setError: (value: string) => void,
    load: (params?: {
        mailboxId?: string | null
        messageId?: string | null
        mailboxUser?: string | null
        silent?: boolean
    }) => Promise<void>,
    action: 'read' | 'unread' | 'flag' | 'unflag' | 'archive' | 'junk' | 'ham' | 'trash' | 'restore',
) {
    try {
        await messageAction(messageId, { mailboxUser: overview.mailboxUser, action })
        await load(['archive', 'trash', 'junk', 'ham', 'restore'].includes(action)
            ? { silent: true, messageId: null }
            : { silent: true })
        return true
    } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to update message.')
        return false
    }
}

export function iconForMailbox(role?: string) {
    if (role === 'inbox') return <Inbox className='h-3.5 w-3.5 text-ui-primary' />
    if (role === 'archive') return <Archive className='h-3.5 w-3.5 text-ui-success' />
    if (role === 'junk') return <ShieldAlert className='h-3.5 w-3.5 text-ui-text' />
    if (role === 'trash') return <Trash2 className='h-3.5 w-3.5 text-ui-text' />
    return <Mail className='h-3.5 w-3.5 text-ui-muted' />
}

export function formatDate(value: string, verbose = false) {
    if (!value) {
        return 'Unknown time'
    }

    return new Intl.DateTimeFormat('en', {
        dateStyle: verbose ? 'full' : 'medium',
        timeStyle: 'short',
    }).format(new Date(value))
}

export function formatRelativeTime(value: number, now: number) {
    const diffMinutes = Math.max(1, Math.floor((now - value) / 60_000))
    if (diffMinutes < 60) {
        return `${diffMinutes}m`
    }

    const diffHours = Math.floor(diffMinutes / 60)
    if (diffHours < 24) {
        return `${diffHours}h`
    }

    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d`
}

export function formatMailboxAddress(address: MailAddress) {
    return address.name ? `${address.name} <${address.email}>` : address.email
}

export function prettyBytes(size: number) {
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function buildMailFrameHtml(html: string, theme: 'light' | 'dark' = 'light', remoteImageUrls: string[] = []) {
    const remoteImageSources = remoteImageUrls.flatMap(value => {
        try {
            const url = new URL(value)
            if (!['http:', 'https:'].includes(url.protocol)) return []
            return [`${url.origin}${url.pathname}`]
        } catch {
            return []
        }
    })
    const imagePolicy = ["'self'", 'data:', 'blob:', ...remoteImageSources].join(' ')
    const policy = `default-src 'none'; img-src ${imagePolicy}; style-src 'unsafe-inline'; font-src 'self' data:; frame-src 'none'; media-src 'none'; object-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'`
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="${policy}" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root { color-scheme: ${theme}; }
    html, body {
      margin: 0;
      padding: 0;
      background: transparent;
      color: CanvasText;
      font-family: Manrope, Aptos, sans-serif;
    }
    body {
      padding: 12px;
      font-size: 14px;
      line-height: 1.6;
    }
    img, iframe, video {
      max-width: 100%;
      height: auto;
      border-radius: 14px;
    }
    a { color: LinkText; }
    table { max-width: 100%; }
    pre, code {
      white-space: pre-wrap;
      word-break: break-word;
    }
  </style>
</head>
<body>${html}</body>
</html>`
}

export function htmlWithApprovedRemoteImages(html: string, safeRemoteUrls: string[]) {
    const normalizedSafeUrls = new Set(safeRemoteUrls.flatMap(value => {
        const normalized = normalizeRemoteImageUrl(value)
        return normalized ? [normalized] : []
    }))
    const parsed = new DOMParser().parseFromString(html, 'text/html')

    // Keep the message readable while preventing every non-image resource path.
    parsed.querySelectorAll('script, iframe, frame, frameset, object, embed, video, audio, source, track, link, base, style, svg, meta[http-equiv]').forEach(node => node.remove())
    parsed.querySelectorAll('[style], [background], [srcset], [poster], [data]').forEach(node => {
        node.removeAttribute('style')
        node.removeAttribute('background')
        node.removeAttribute('srcset')
        node.removeAttribute('poster')
        node.removeAttribute('data')
    })
    parsed.querySelectorAll('[src]').forEach(node => {
        const src = node.getAttribute('src') || ''
        if (node.tagName.toLowerCase() !== 'img') {
            node.removeAttribute('src')
            return
        }
        const normalized = normalizeRemoteImageUrl(src)
        if (normalized && normalizedSafeUrls.has(normalized)) {
            node.setAttribute('src', normalized)
        } else if (!src.startsWith('/') || src.startsWith('//')) {
            if (src.toLowerCase().startsWith('data:image/')) return
            node.removeAttribute('src')
        }
    })

    return parsed.body.innerHTML
}

export function normalizeRemoteImageUrl(value: string) {
    try {
        const url = new URL(value)
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
        url.hash = ''
        return url.href
    } catch {
        return null
    }
}

export function remoteImageUrlsFromHtml(html: string) {
    const parsed = new DOMParser().parseFromString(html, 'text/html')
    return new Set(Array.from(parsed.querySelectorAll('img[src]'), image => {
        const src = image.getAttribute('src') || ''
        return normalizeRemoteImageUrl(src)
    }).filter((url): url is string => Boolean(url)))
}

export async function fileToDraftAttachment(file: File): Promise<DraftAttachment> {
    const buffer = await file.arrayBuffer()
    return {
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        contentBase64: arrayBufferToBase64(buffer),
    }
}

export function AttachmentPreview({ attachment, mailboxUser, reputation, checking }: { attachment: MailAttachment, mailboxUser: string, reputation?: MailReputation, checking: boolean }) {
    const [url, setUrl] = useState('')
    const [error, setError] = useState(false)
    const allowedByReputation = !checking && reputation?.status === 'known' && reputation.flagged === 0
    useEffect(() => {
        const controller = new AbortController()
        let objectUrl = ''
        setUrl('')
        setError(false)
        if (!allowedByReputation) return () => controller.abort()
        void fetchMailBlob(mailboxUser, attachment.blobId, attachment.name, controller.signal)
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
    }, [mailboxUser, attachment.blobId, attachment.name, allowedByReputation])

    const blockedMessage = checking
        ? 'Checking VirusTotal…'
        : !reputation || reputation.status === 'unavailable'
            ? 'VirusTotal status unavailable; download blocked.'
            : reputation.status === 'unknown'
                ? 'VirusTotal has no report for this file; download blocked.'
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

export function ActionIconButton({ label, icon, onClick, disabled }: { label: string, icon: ReactNode, onClick: () => void, disabled?: boolean }) {
    return (
        <button disabled={disabled} title={label} aria-label={label} className={iconButton} onClick={onClick}>
            {icon}
        </button>
    )
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
