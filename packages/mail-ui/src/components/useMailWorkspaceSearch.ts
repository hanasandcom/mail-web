'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { MailUiApi } from '../api'
import type { MailMessageSummary, MailOverview } from '../types'
import { buildMailListFilters, messageMatchesMailFilter, type MailListFilter } from './mailWorkspaceStatus'

type SearchPage = {
    query: string
    mailboxUser: string
    mailboxId: string
    messages: MailMessageSummary[]
    nextCursor: string | null
}

export function useMailWorkspaceSearch({
    api, overview, setOverview, requestVersion, selection, requestPending, paginationPending,
    pageError, setPageError,
}: {
    api: MailUiApi
    overview: MailOverview | null
    setOverview: Dispatch<SetStateAction<MailOverview | null>>
    requestVersion: { current: number }
    selection: { current: { user: string | null, mailbox: string | null, message: string | null } }
    requestPending: { current: boolean }
    paginationPending: { current: boolean }
    pageError: string
    setPageError: Dispatch<SetStateAction<string>>
}) {
    const [query, setQuery] = useState('')
    const [mailFilter, setMailFilter] = useState<MailListFilter>('all')
    const [mailboxSearch, setMailboxSearch] = useState<SearchPage | null>(null)
    const [searchPending, setSearchPending] = useState(false)
    const [searchError, setSearchError] = useState('')
    const [searchRefresh, setSearchRefresh] = useState(0)
    const [searchOpen, setSearchOpen] = useState(false)
    const [loadingMore, setLoadingMore] = useState(false)
    const nextPageTrigger = useRef<HTMLDivElement>(null)
    const searchInput = useRef<HTMLInputElement>(null)
    const searchVersion = useRef(0)
    const normalizedQuery = query.trim()
    const currentMailboxSearch = mailboxSearch?.query === normalizedQuery
        && mailboxSearch.mailboxUser === overview?.mailboxUser
        && mailboxSearch.mailboxId === overview?.selectedMailboxId ? mailboxSearch : null
    const filteredMessages = useMemo(() => {
        const messages = normalizedQuery ? currentMailboxSearch?.messages || [] : overview?.messages || []
        return messages.filter(message => messageMatchesMailFilter(message, mailFilter))
    }, [currentMailboxSearch, overview?.messages, normalizedQuery, mailFilter])
    const mailboxFilterOptions = useMemo(() => buildMailListFilters(overview?.messages || []), [overview?.messages])
    const hasMoreMessages = normalizedQuery ? Boolean(currentMailboxSearch?.nextCursor) : Boolean(overview?.nextCursor)

    useEffect(() => { if (searchOpen) searchInput.current?.focus() }, [searchOpen])
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') { event.preventDefault(); setSearchOpen(true) }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [])

    const loadMore = useCallback(async () => {
        if (!overview || paginationPending.current || requestPending.current) return
        const cursor = normalizedQuery ? currentMailboxSearch?.nextCursor : overview.nextCursor
        if (!cursor || overview.mailboxUser !== selection.current.user || overview.selectedMailboxId !== selection.current.mailbox) return
        const version = requestVersion.current
        const searchVersionAtStart = searchVersion.current
        paginationPending.current = true
        setLoadingMore(true)
        setPageError('')
        try {
            const page = normalizedQuery
                ? await api.searchMail({ mailboxUser: overview.mailboxUser, mailboxId: overview.selectedMailboxId!, query: normalizedQuery, after: cursor })
                : await api.fetchMailOverview({ mailboxUser: overview.mailboxUser, mailboxId: overview.selectedMailboxId, after: cursor })
            if (version !== requestVersion.current) return
            if (normalizedQuery) {
                if (searchVersionAtStart !== searchVersion.current) return
                setMailboxSearch(current => {
                    if (!current || current.query !== normalizedQuery || current.mailboxUser !== overview.mailboxUser || current.mailboxId !== overview.selectedMailboxId) return current
                    const ids = new Set(current.messages.map(message => message.id))
                    return { ...current, messages: [...current.messages, ...page.messages.filter(message => !ids.has(message.id))], nextCursor: page.nextCursor || null }
                })
                return
            }
            setOverview(current => {
                if (!current || version !== requestVersion.current || current.mailboxUser !== overview.mailboxUser || current.selectedMailboxId !== overview.selectedMailboxId) return current
                const ids = new Set(current.messages.map(message => message.id))
                return { ...current, messages: [...current.messages, ...page.messages.filter(message => !ids.has(message.id))], nextCursor: page.nextCursor }
            })
        } catch {
            if (version === requestVersion.current) setPageError('Could not load older messages. Try again.')
        } finally {
            paginationPending.current = false
            setLoadingMore(false)
        }
    }, [api, currentMailboxSearch, normalizedQuery, overview, paginationPending, requestPending, requestVersion, selection, setOverview])

    useEffect(() => {
        const target = nextPageTrigger.current
        if (!target || !hasMoreMessages || loadingMore || pageError) return
        const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) void loadMore() }, { rootMargin: '300px' })
        observer.observe(target)
        return () => observer.disconnect()
    }, [loadMore, hasMoreMessages, loadingMore, pageError])

    useEffect(() => {
        const user = overview?.mailboxUser
        const mailboxId = overview?.selectedMailboxId
        const version = ++searchVersion.current
        setMailboxSearch(null)
        setSearchError('')
        if (!normalizedQuery || !user || !mailboxId) { setSearchPending(false); return }
        setSearchPending(true)
        const timer = window.setTimeout(() => {
            void api.searchMail({ mailboxUser: user, mailboxId, query: normalizedQuery }).then(page => {
                if (version === searchVersion.current) setMailboxSearch({ query: normalizedQuery, mailboxUser: user, mailboxId, ...page })
            }).catch(cause => {
                if (version === searchVersion.current) setSearchError(cause instanceof Error ? cause.message : 'Unable to search this mailbox.')
            }).finally(() => { if (version === searchVersion.current) setSearchPending(false) })
        }, 250)
        return () => { window.clearTimeout(timer); if (version === searchVersion.current) searchVersion.current++ }
    }, [api, normalizedQuery, overview?.mailboxUser, overview?.selectedMailboxId, searchRefresh])

    return { query, setQuery, mailFilter, setMailFilter, searchOpen, setSearchOpen, searchInput, searchPending, searchError, setSearchRefresh, loadingMore, pageError, nextPageTrigger, filteredMessages, mailboxFilterOptions, hasMoreMessages, loadMore }
}
