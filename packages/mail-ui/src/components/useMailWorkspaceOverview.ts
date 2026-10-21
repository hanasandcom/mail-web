'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { MailUiApi } from '../api'
import type { MailOverview } from '../types'

export type LoadParams = {
    mailboxId?: string | null
    messageId?: string | null
    mailboxUser?: string | null
    silent?: boolean
}
export type LoadMail = (params?: LoadParams) => Promise<void>

export function useMailWorkspaceOverview({
    api,
    mailboxUser,
    onMailboxChange,
    onBack,
}: {
    api: MailUiApi
    mailboxUser?: string | null
    onMailboxChange?: (mailboxId: string | null) => void
    onBack?: () => void
}) {
    const [overview, setOverview] = useState<MailOverview | null>(null)
    const [selectedMailboxId, setSelectedMailboxId] = useState<string | null>(null)
    const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [backgroundIssue, setBackgroundIssue] = useState('')
    const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null)
    const [unreachableSince, setUnreachableSince] = useState<number | null>(null)
    const [now, setNow] = useState(() => Date.now())
    const selection = useRef<{ user: string | null, mailbox: string | null, message: string | null }>({ user: mailboxUser || null, mailbox: null, message: null })
    const requestVersion = useRef(0)
    const requestPending = useRef(false)
    const paginationPending = useRef(false)
    const archivingRef = useRef(false)

    const load = useCallback(async (params: LoadParams = {}) => {
        if (params.messageId === null) onBack?.()
        const silent = Boolean(params.silent)
        if (silent && (requestPending.current || paginationPending.current || archivingRef.current)) return
        const version = ++requestVersion.current
        requestPending.current = true

        try {
            if (!silent) {
                setLoading(true)
                setError('')
            }
            if (params.messageId && !silent) {
                await api.messageAction(params.messageId, { mailboxUser: params.mailboxUser ?? selection.current.user ?? mailboxUser ?? undefined, action: 'read' })
            }
            const next = await api.fetchMailOverview({
                mailboxUser: params.mailboxUser ?? selection.current.user ?? mailboxUser ?? undefined,
                mailboxId: params.mailboxId === undefined ? selection.current.mailbox : params.mailboxId,
                messageId: params.messageId === undefined ? selection.current.message : params.messageId,
            })
            if (version !== requestVersion.current) return
            const switched = next.mailboxUser !== selection.current.user || next.selectedMailboxId !== selection.current.mailbox
            setOverview(current => {
                if (version !== requestVersion.current) return current
                if (params.messageId === null || !current || current.mailboxUser !== next.mailboxUser || current.selectedMailboxId !== next.selectedMailboxId || current.messages.length <= 50) return next
                const ids = new Set(next.messages.map(message => message.id))
                const boundary = current.messages.findIndex(message => message.id === next.messages.at(-1)?.id)
                const tail = current.messages.slice(boundary >= 0 ? boundary + 1 : 50)
                return { ...next, messages: [...next.messages, ...tail.filter(message => !ids.has(message.id))], nextCursor: current.nextCursor }
            })
            if (switched) onMailboxChange?.(next.selectedMailboxId)
            setSelectedMailboxId(next.selectedMailboxId)
            const nextMessageId = params.messageId || next.selectedMessage?.id || next.messages.find(message => message.id === selection.current.message)?.id || next.messages[0]?.id || null
            selection.current = { user: next.mailboxUser, mailbox: next.selectedMailboxId, message: nextMessageId }
            setSelectedMessageId(nextMessageId)
            setError('')
            setBackgroundIssue('')
            setUnreachableSince(null)
            setLastSuccessAt(Date.now())
        } catch (cause) {
            if (version !== requestVersion.current) return
            const rawMessage = cause instanceof Error ? cause.message : ''
            const message = /failed to fetch|networkerror|load failed|socket connection was closed unexpectedly|socket hang up|econnreset/i.test(rawMessage)
                ? 'The mail service closed the connection before the mailbox loaded. Mail will retry automatically.'
                : rawMessage || 'Unable to load the mailbox.'
            if (silent) {
                setUnreachableSince(current => current ?? Date.now())
                setBackgroundIssue(message)
            } else setError(message)
        } finally {
            if (version === requestVersion.current) requestPending.current = false
            if (!silent && version === requestVersion.current) setLoading(false)
        }
    }, [api, mailboxUser, onBack, onMailboxChange])

    useEffect(() => {
        void load({ mailboxUser, mailboxId: null, messageId: null })
        return () => { requestVersion.current++; requestPending.current = false }
    }, [load, mailboxUser])

    useEffect(() => {
        const poll = window.setInterval(() => { void load({ silent: true }); setNow(Date.now()) }, 10_000)
        const onVisibilityChange = () => {
            setNow(Date.now())
            if (document.visibilityState === 'visible') void load({ silent: true })
        }
        document.addEventListener('visibilitychange', onVisibilityChange)
        return () => { window.clearInterval(poll); document.removeEventListener('visibilitychange', onVisibilityChange) }
    }, [load])

    return { overview, setOverview, selectedMailboxId, setSelectedMailboxId, selectedMessageId, setSelectedMessageId, loading, error, setError, backgroundIssue, lastSuccessAt, unreachableSince, now, load, selection, requestVersion, requestPending, paginationPending, archivingRef }
}
