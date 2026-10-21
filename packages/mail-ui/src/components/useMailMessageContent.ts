'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMailUiApi } from '../api'
import type { MailMessage, MailOverview } from '../types'
import {
    buildMailFrameHtml,
    htmlWithApprovedRemoteImages,
    isInlineAttachmentType,
    normalizeRemoteImageUrl,
    remoteImageUrlsFromHtml,
    withInlineAttachments,
} from './utils'

type Api = ReturnType<typeof useMailUiApi>

export function useMailMessageContent({
    api,
    message,
    overview,
    theme,
}: {
    api: Api
    message: MailMessage | null
    overview: MailOverview | null
    theme: 'light' | 'dark'
}) {
    const [remoteContent, setRemoteContent] = useState<{ messageId: string, urls: Awaited<ReturnType<Api['fetchMailRemoteContent']>> } | null>(null)
    const [remoteContentPending, setRemoteContentPending] = useState(false)
    const [remoteContentError, setRemoteContentError] = useState('')
    const [remoteHtmlOverride, setRemoteHtmlOverride] = useState<{ messageId: string, html: string } | null>(null)
    const currentRemoteUrls = remoteContent && remoteContent.messageId === message?.id ? remoteContent.urls.remoteUrls : []
    const currentAttachmentReputations = useMemo(() => remoteContent && remoteContent.messageId === message?.id
        ? new Map(remoteContent.urls.attachments.map(item => [item.blobId, item.reputation]))
        : new Map(), [remoteContent, message?.id])
    const currentRemoteHtml = remoteHtmlOverride && remoteHtmlOverride.messageId === message?.id ? remoteHtmlOverride.html : null
    const safeInlineAttachments = useMemo(() => message?.attachments.filter(attachment => {
        const reputation = currentAttachmentReputations.get(attachment.blobId)
        return Boolean(attachment.cid && isInlineAttachmentType(attachment.type) && reputation?.status === 'known' && reputation.flagged === 0)
    }) || [], [message, currentAttachmentReputations])
    const [inlineAttachmentUrls, setInlineAttachmentUrls] = useState<{ messageId: string, urls: Record<string, string> } | null>(null)
    const currentInlineAttachmentUrls = inlineAttachmentUrls && inlineAttachmentUrls.messageId === message?.id ? inlineAttachmentUrls.urls : {}

    useEffect(() => {
        let active = true
        setRemoteContent(null)
        setRemoteContentError('')
        setRemoteHtmlOverride(null)
        if ((!message?.htmlBody && !message?.attachments.length) || !overview?.mailboxUser) {
            setRemoteContentPending(false)
            return () => { active = false }
        }

        setRemoteContentPending(true)
        void api.fetchMailRemoteContent({ mailboxUser: overview.mailboxUser, messageId: message.id })
            .then(result => {
                if (!active) return
                const imageUrls = remoteImageUrlsFromHtml(withInlineAttachments(message, overview.mailboxUser))
                setRemoteContent({ messageId: message.id, urls: { ...result, remoteUrls: result.remoteUrls.filter(item => imageUrls.has(item.url)) } })
            })
            .catch(() => { if (active) setRemoteContentError('Remote image safety status is unavailable. Images remain blocked.') })
            .finally(() => { if (active) setRemoteContentPending(false) })
        return () => { active = false }
    }, [api, message?.id, message?.htmlBody, message?.attachments.length, overview?.mailboxUser])

    useEffect(() => {
        let active = true
        const controller = new AbortController()
        const messageId = message?.id || ''
        setInlineAttachmentUrls({ messageId, urls: {} })
        if (!message || !overview?.mailboxUser || !safeInlineAttachments.length) {
            return () => { active = false; controller.abort() }
        }

        const objectUrls: string[] = []
        void Promise.all(safeInlineAttachments.map(async attachment => {
            const response = await api.fetchMailBlob(overview.mailboxUser, attachment.blobId, attachment.name, controller.signal)
            const objectUrl = URL.createObjectURL(await response.blob())
            objectUrls.push(objectUrl)
            return [attachment.blobId, objectUrl] as const
        })).then(entries => {
            if (active) setInlineAttachmentUrls({ messageId, urls: Object.fromEntries(entries) })
        }).catch(() => {})

        return () => {
            active = false
            controller.abort()
            objectUrls.forEach(URL.revokeObjectURL)
        }
    }, [api, message?.id, overview?.mailboxUser, safeInlineAttachments])

    const safeRemoteImageUrls = useMemo(() => Array.from(new Set(currentRemoteUrls.flatMap(item => {
        if (item.reputation.provider !== 'virustotal' || item.reputation.status !== 'known' || item.reputation.flagged !== 0) return []
        const normalized = normalizeRemoteImageUrl(item.url)
        return normalized && normalized === item.url ? [normalized] : []
    }))), [currentRemoteUrls])

    const renderedHtml = useMemo(
        () => message ? buildMailFrameHtml(currentRemoteHtml ?? withInlineAttachments(message, overview?.mailboxUser || '', currentInlineAttachmentUrls), theme, currentRemoteHtml ? safeRemoteImageUrls : []) : '',
        [message, overview?.mailboxUser, theme, currentRemoteHtml, safeRemoteImageUrls, currentInlineAttachmentUrls]
    )

    return {
        currentAttachmentReputations,
        currentInlineAttachmentUrls,
        currentRemoteHtml,
        currentRemoteUrls,
        remoteContentError,
        remoteContentPending,
        renderedHtml,
        safeRemoteImageUrls,
        setRemoteHtmlOverride: (html: string | null) => setRemoteHtmlOverride(html && message ? { messageId: message.id, html } : null),
        withApprovedRemoteImages: () => message
            ? htmlWithApprovedRemoteImages(withInlineAttachments(message, overview?.mailboxUser || '', currentInlineAttachmentUrls), safeRemoteImageUrls)
            : '',
    }
}
