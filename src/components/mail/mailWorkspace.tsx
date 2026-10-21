'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    Archive,
    ArrowLeft,
    CornerUpLeft,
    FolderInput,
    Forward,
    Inbox,
    MailPlus,
    PanelLeftClose,
    PanelLeftOpen,
    Radar,
    Reply,
    Search,
    Settings2,
    ShieldCheck,
    ShieldAlert,
    Star,
    Trash2,
    X,
} from 'lucide-react'
import {
    createFilter,
    createMailbox,
    deleteFilter,
    fetchMailBlob,
    fetchMailRemoteContent,
    fetchMailOverview,
    messageAction,
    searchMail,
    sendMail,
} from '@/utils/mail/client'
import type { MailMessageSummary, MailOverview } from '@/utils/mail/types'
import { DashboardPage, DashboardPanel, dashboardPanelClass } from '@/components/dashboard/ui'
import ErrorNotice from '@/components/error/errorNotice'
import DmarcReportPreview, { reportAttachments } from './dmarcReport'
import { Composer, MessageRow, type MailQuickAction } from './mailWorkspaceParts'
import {
    ActionIconButton,
    AttachmentPreview,
    buildMailFrameHtml,
    composeFromReply,
    emptyComposer,
    formatDate,
    formatMailboxAddress,
    formatRelativeTime,
    htmlWithApprovedRemoteImages,
    iconButton,
    iconForMailbox,
    isInlineAttachmentType,
    normalizeRemoteImageUrl,
    remoteImageUrlsFromHtml,
    runAction,
    subtleInput,
    toolbarButton,
    withInlineAttachments,
    type ComposerState,
} from './utils'

type Props = {
    mailboxUser?: string | null
}

type MailListFilter = 'all' | 'unread' | 'starred' | 'attachments'
type MailSearchPage = {
    query: string
    mailboxUser: string
    mailboxId: string
    messages: MailMessageSummary[]
    nextCursor: string | null
}

const POLL_INTERVAL_MS = 10_000
const STALE_AFTER_MS = 60_000

export default function MailWorkspace({ mailboxUser }: Props) {
    const [overview, setOverview] = useState<MailOverview | null>(null)
    const [mailTheme, setMailTheme] = useState<'light' | 'dark'>('light')
    useEffect(() => {
        const root = document.documentElement
        const update = () => setMailTheme(root.classList.contains('dark') ? 'dark' : 'light')
        update()
        const observer = new MutationObserver(update)
        observer.observe(root, { attributes: true, attributeFilter: ['class'] })
        return () => observer.disconnect()
    }, [])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [backgroundIssue, setBackgroundIssue] = useState('')
    const [selectedMailboxId, setSelectedMailboxId] = useState<string | null>(null)
    const [readingMessage, setReadingMessage] = useState(false)
    const reader = useRef<HTMLElement>(null)
    useEffect(() => {
        if (readingMessage) reader.current?.scrollIntoView({ block: 'start' })
    }, [readingMessage])
    const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
    const [composer, setComposer] = useState<ComposerState>(emptyComposer)
    const sendIdempotencyKey = useRef<string | null>(null)
    const [creatingMailbox, setCreatingMailbox] = useState(false)
    const [mailboxModalOpen, setMailboxModalOpen] = useState(false)
    const [mailboxDraft, setMailboxDraft] = useState('')
    const [creatingFilter, setCreatingFilter] = useState(false)
    const [sidebarCompact, setSidebarCompact] = useState(false)
    const [adminDrawerOpen, setAdminDrawerOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [searchOpen, setSearchOpen] = useState(false)
    const [mailboxSearch, setMailboxSearch] = useState<MailSearchPage | null>(null)
    const [searchPending, setSearchPending] = useState(false)
    const [searchError, setSearchError] = useState('')
    const [searchRefresh, setSearchRefresh] = useState(0)
    const searchInput = useRef<HTMLInputElement>(null)
    const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null)
    const [unreachableSince, setUnreachableSince] = useState<number | null>(null)
    const [now, setNow] = useState(() => Date.now())
    const selection = useRef<{ user: string | null, mailbox: string | null, message: string | null }>({ user: mailboxUser || null, mailbox: null, message: null })
    const requestVersion = useRef(0)
    const searchVersion = useRef(0)
    const requestPending = useRef(false)
    const paginationPending = useRef(false)
    const nextPageTrigger = useRef<HTMLDivElement>(null)
    const [loadingMore, setLoadingMore] = useState(false)
    const [pageError, setPageError] = useState('')
    const [selectionMode, setSelectionMode] = useState(false)
    const [checkedMessages, setCheckedMessages] = useState<Set<string>>(new Set())
    const [archiving, setArchiving] = useState(false)
    const archivingRef = useRef(false)
    const openComposer = (state: ComposerState) => {
        sendIdempotencyKey.current = null
        setComposer(state)
    }
    const [mailFilter, setMailFilter] = useState<MailListFilter>('all')
    const normalizedQuery = query.trim()
    const currentMailboxSearch = mailboxSearch?.query === normalizedQuery
        && mailboxSearch.mailboxUser === overview?.mailboxUser
        && mailboxSearch.mailboxId === overview?.selectedMailboxId
        ? mailboxSearch
        : null
    const hasMoreMessages = normalizedQuery
        ? Boolean(currentMailboxSearch?.nextCursor)
        : Boolean(overview?.nextCursor)

    useEffect(() => {
        if (searchOpen) searchInput.current?.focus()
    }, [searchOpen])

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') {
                event.preventDefault()
                setSearchOpen(true)
            }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [])

    const load = useCallback(async (params: {
        mailboxId?: string | null
        messageId?: string | null
        mailboxUser?: string | null
        silent?: boolean
    } = {}) => {
        if (params.messageId === null) setReadingMessage(false)
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
                await messageAction(params.messageId, { mailboxUser: params.mailboxUser ?? selection.current.user ?? mailboxUser ?? undefined, action: 'read' })
            }
            const next = await fetchMailOverview({
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
            if (switched) { setPageError(''); setCheckedMessages(new Set()); setSelectionMode(false) }
            setSelectedMailboxId(next.selectedMailboxId)
            const nextSelectedMessageId = params.messageId
                || next.selectedMessage?.id
                || next.messages.find(message => message.id === selection.current.message)?.id
                || next.messages[0]?.id
                || null
            selection.current = { user: next.mailboxUser, mailbox: next.selectedMailboxId, message: nextSelectedMessageId }
            setSelectedMessageId(nextSelectedMessageId)
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
            } else {
                setError(message)
            }
        } finally {
            if (version === requestVersion.current) requestPending.current = false
            if (!silent && version === requestVersion.current) {
                setLoading(false)
            }
        }
    }, [mailboxUser])

    const loadMore = useCallback(async () => {
        if (!overview || paginationPending.current || requestPending.current) return
        const term = normalizedQuery
        const cursor = term
            ? currentMailboxSearch?.nextCursor
            : overview.nextCursor
        if (!cursor) return
        if (overview.mailboxUser !== selection.current.user || overview.selectedMailboxId !== selection.current.mailbox) return
        const version = requestVersion.current
        const searchVersionAtStart = searchVersion.current
        paginationPending.current = true
        setLoadingMore(true)
        setPageError('')
        try {
            const page = term
                ? await searchMail({ mailboxUser: overview.mailboxUser, mailboxId: overview.selectedMailboxId!, query: term, after: cursor })
                : await fetchMailOverview({ mailboxUser: overview.mailboxUser, mailboxId: overview.selectedMailboxId, after: cursor })
            if (version !== requestVersion.current) return
            if (term) {
                if (searchVersionAtStart !== searchVersion.current) return
                setMailboxSearch(current => {
                    if (!current || current.query !== term || current.mailboxUser !== overview.mailboxUser || current.mailboxId !== overview.selectedMailboxId) return current
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
    }, [currentMailboxSearch, normalizedQuery, overview])

    async function quickAction(message: MailMessageSummary, action: MailQuickAction) {
        if (!overview || loading || archivingRef.current) return
        if (action === 'reply' || action === 'replyAll' || action === 'forward') {
            const version = requestVersion.current
            try {
                const detail = await fetchMailOverview({ mailboxUser: overview.mailboxUser, mailboxId: overview.selectedMailboxId, messageId: message.id })
                if (version !== requestVersion.current) return
                if (!detail.selectedMessage) throw new Error('This message is no longer available.')
                openComposer(composeFromReply(action, detail.selectedMessage, overview.mailboxAddress))
            } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to open message.') }
        } else {
            await performAction(message.id, action)
        }
    }

    async function performAction(messageId: string, action: 'archive' | 'trash' | 'read' | 'unread' | 'flag' | 'unflag' | 'junk' | 'ham' | 'restore') {
        if (!overview) return
        if (await runAction(messageId, overview, setError, load, action)) setSearchRefresh(value => value + 1)
    }

    useEffect(() => {
        const target = nextPageTrigger.current
        if (!target || !hasMoreMessages || loadingMore || pageError) return
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) void loadMore()
        }, { rootMargin: '300px' })
        observer.observe(target)
        return () => observer.disconnect()
    }, [loadMore, hasMoreMessages, loadingMore, pageError])

    useEffect(() => {
        void load({ mailboxUser, mailboxId: null, messageId: null })
        return () => { requestVersion.current++; requestPending.current = false }
    }, [load, mailboxUser])

    useEffect(() => {
        const poll = window.setInterval(() => {
            void load({ silent: true })
            setNow(Date.now())
        }, POLL_INTERVAL_MS)

        const onVisibilityChange = () => {
            setNow(Date.now())
            if (document.visibilityState === 'visible') {
                void load({ silent: true })
            }
        }

        document.addEventListener('visibilitychange', onVisibilityChange)
        return () => {
            window.clearInterval(poll)
            document.removeEventListener('visibilitychange', onVisibilityChange)
        }
    }, [load])

    useEffect(() => {
        const term = query.trim()
        const user = overview?.mailboxUser
        const mailboxId = overview?.selectedMailboxId
        const version = ++searchVersion.current
        setMailboxSearch(null)
        setSearchError('')

        if (!term || !user || !mailboxId) {
            setSearchPending(false)
            return
        }

        setSearchPending(true)
        const timer = window.setTimeout(() => {
            void searchMail({ mailboxUser: user, mailboxId, query: term }).then(page => {
                if (version !== searchVersion.current) return
                setMailboxSearch({ query: term, mailboxUser: user, mailboxId, ...page })
            }).catch(cause => {
                if (version !== searchVersion.current) return
                setSearchError(cause instanceof Error ? cause.message : 'Unable to search this mailbox.')
            }).finally(() => {
                if (version === searchVersion.current) setSearchPending(false)
            })
        }, 250)

        return () => {
            window.clearTimeout(timer)
            if (version === searchVersion.current) searchVersion.current++
        }
    }, [query, overview?.mailboxUser, overview?.selectedMailboxId, searchRefresh])

    const filteredMessages = useMemo(() => {
        const messages = normalizedQuery
            ? currentMailboxSearch?.messages || []
            : overview?.messages || []

        return messages.filter(message => {
            if (!messageMatchesMailFilter(message, mailFilter)) {
                return false
            }
            return true
        })
    }, [currentMailboxSearch, overview?.messages, normalizedQuery, mailFilter])

    const checkedVisible = filteredMessages.filter(message => checkedMessages.has(message.id))

    const allVisibleSelected = filteredMessages.length > 0 && checkedVisible.length === filteredMessages.length

    async function archiveSelected() {
        if (!overview || archivingRef.current || !checkedVisible.length) return
        const user = overview.mailboxUser
        const mailbox = overview.selectedMailboxId
        const ids = checkedVisible.map(message => message.id)
        const succeeded = new Set<string>()
        archivingRef.current = true
        setArchiving(true)
        setError('')
        try {
            for (const id of ids) {
                try {
                    await messageAction(id, { mailboxUser: user, action: 'archive' })
                    succeeded.add(id)
                } catch { /* Keep failed messages selected so they can be retried. */ }
            }
            if (selection.current.user === user && selection.current.mailbox === mailbox) {
                setCheckedMessages(current => new Set([...current].filter(id => !succeeded.has(id))))
                setOverview(current => current && current.mailboxUser === user && current.selectedMailboxId === mailbox
                    ? { ...current, messages: current.messages.filter(message => !succeeded.has(message.id)) } : current)
                archivingRef.current = false
                await load({ silent: true })
                if (succeeded.size) setSearchRefresh(value => value + 1)
                if (succeeded.size !== ids.length) setError(`Could not archive ${ids.length - succeeded.size} selected ${ids.length - succeeded.size === 1 ? 'message' : 'messages'}. Try again.`)
            }
        } finally {
            archivingRef.current = false
            setArchiving(false)
        }
    }

    const mailboxFilterOptions = useMemo(() => buildMailListFilters(overview?.messages || []), [overview?.messages])

    const selectedMessage = overview?.selectedMessage?.id === selectedMessageId ? overview.selectedMessage : null

    const [remoteContent, setRemoteContent] = useState<{ messageId: string, urls: Awaited<ReturnType<typeof fetchMailRemoteContent>> } | null>(null)
    const [remoteContentPending, setRemoteContentPending] = useState(false)
    const [remoteContentError, setRemoteContentError] = useState('')
    const [remoteHtmlOverride, setRemoteHtmlOverride] = useState<{ messageId: string, html: string } | null>(null)
    const currentRemoteUrls = remoteContent && remoteContent.messageId === selectedMessage?.id ? remoteContent.urls.remoteUrls : []
    const currentAttachmentReputations = useMemo(() => remoteContent && remoteContent.messageId === selectedMessage?.id
        ? new Map(remoteContent.urls.attachments.map(item => [item.blobId, item.reputation]))
        : new Map(), [remoteContent, selectedMessage?.id])
    const currentRemoteHtml = remoteHtmlOverride && remoteHtmlOverride.messageId === selectedMessage?.id ? remoteHtmlOverride.html : null
    const safeInlineAttachments = useMemo(() => selectedMessage?.attachments.filter(attachment => {
        const reputation = currentAttachmentReputations.get(attachment.blobId)
        return Boolean(attachment.cid && isInlineAttachmentType(attachment.type) && reputation?.status === 'known' && reputation.flagged === 0)
    }) || [], [selectedMessage, currentAttachmentReputations])
    const [inlineAttachmentUrls, setInlineAttachmentUrls] = useState<{ messageId: string, urls: Record<string, string> } | null>(null)
    const currentInlineAttachmentUrls = inlineAttachmentUrls && inlineAttachmentUrls.messageId === selectedMessage?.id ? inlineAttachmentUrls.urls : {}

    useEffect(() => {
        let active = true
        setRemoteContent(null)
        setRemoteContentError('')
        setRemoteHtmlOverride(null)
        if ((!selectedMessage?.htmlBody && !selectedMessage?.attachments.length) || !overview?.mailboxUser) {
            setRemoteContentPending(false)
            return () => { active = false }
        }

        setRemoteContentPending(true)
        void fetchMailRemoteContent({ mailboxUser: overview.mailboxUser, messageId: selectedMessage.id })
            .then(result => {
                if (!active) return
                const imageUrls = remoteImageUrlsFromHtml(withInlineAttachments(selectedMessage, overview.mailboxUser))
                setRemoteContent({ messageId: selectedMessage.id, urls: { ...result, remoteUrls: result.remoteUrls.filter(item => imageUrls.has(item.url)) } })
            })
            .catch(() => { if (active) setRemoteContentError('Remote image safety status is unavailable. Images remain blocked.') })
            .finally(() => { if (active) setRemoteContentPending(false) })
        return () => { active = false }
    }, [selectedMessage?.id, selectedMessage?.htmlBody, selectedMessage?.attachments.length, overview?.mailboxUser])

    useEffect(() => {
        let active = true
        const controller = new AbortController()
        const messageId = selectedMessage?.id || ''
        setInlineAttachmentUrls({ messageId, urls: {} })
        if (!selectedMessage || !overview?.mailboxUser || !safeInlineAttachments.length) {
            return () => { active = false; controller.abort() }
        }

        const objectUrls: string[] = []
        void Promise.all(safeInlineAttachments.map(async attachment => {
            const response = await fetchMailBlob(overview.mailboxUser, attachment.blobId, attachment.name, controller.signal)
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
    }, [selectedMessage?.id, overview?.mailboxUser, safeInlineAttachments])

    const safeRemoteImageUrls = useMemo(() => Array.from(new Set(currentRemoteUrls.flatMap(item => {
        if (item.reputation.provider !== 'virustotal' || item.reputation.status !== 'known' || item.reputation.flagged !== 0) return []
        const normalized = normalizeRemoteImageUrl(item.url)
        return normalized && normalized === item.url ? [normalized] : []
    }))), [currentRemoteUrls])

    const renderedHtml = useMemo(
        () => selectedMessage ? buildMailFrameHtml(currentRemoteHtml ?? withInlineAttachments(selectedMessage, overview?.mailboxUser || '', currentInlineAttachmentUrls), mailTheme, currentRemoteHtml ? safeRemoteImageUrls : []) : '',
        [selectedMessage, overview?.mailboxUser, mailTheme, currentRemoteHtml, safeRemoteImageUrls, currentInlineAttachmentUrls]
    )

    const unreadCount = overview?.accessibleAccounts.find(account => account.id === overview.actor.id)?.unreadCount ?? 0
    const showUnreachableWarning = Boolean(unreachableSince && now - unreachableSince >= STALE_AFTER_MS)

    return (
        <DashboardPage style={{ display: 'flex', height: '100%', minHeight: 0, flexDirection: 'column' }} className='@container !gap-4 !px-2 !py-4'>
            <DashboardPanel className='flex shrink-0 flex-wrap items-center gap-2 p-2.5 sm:p-3' id='mail-toolbar'>
                <div className='flex min-w-0 flex-1 flex-wrap items-center gap-2'>
                    <div className='mr-auto flex h-8 min-w-0 flex-col justify-center'>
                        <p className='text-xs leading-4 text-ui-muted'>Mailbox</p>
                        {overview ? <p className='truncate text-xs leading-4 text-ui-muted'>{overview.mailboxAddress || 'Communication'}</p> : <span aria-hidden='true' className='mt-1 block h-3 w-28 animate-pulse rounded bg-ui-raised' />}
                    </div>
                    <div className='flex flex-wrap items-center gap-2 text-xs font-semibold text-ui-muted' data-mail-counts>
                        {overview ? <>
                            <span className='inline-flex h-8 items-center rounded-md border border-ui-border bg-ui-raised px-2'>{unreadCount} unread</span>
                            <span className='inline-flex h-8 items-center rounded-md border border-ui-border bg-ui-raised px-2'>{filteredMessages.length} visible</span>
                        </> : <>
                            <span aria-hidden='true' className='h-8 w-20 animate-pulse rounded-md bg-ui-raised' />
                            <span aria-hidden='true' className='h-8 w-20 animate-pulse rounded-md bg-ui-raised' />
                        </>}
                    </div>
                    <MailSyncStatus lastSuccessAt={lastSuccessAt} unreachableSince={unreachableSince} now={now} />

                    <div className='flex min-w-0 items-center gap-2'>
                        {searchOpen ? (
                            <div className='relative w-48 sm:w-60'>
                                <Search className='pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-ui-muted' />
                                <input
                                    ref={searchInput}
                                    value={query}
                                    onChange={event => setQuery(event.target.value)}
                                    onKeyDown={event => { if (event.key === 'Escape') { setQuery(''); setSearchOpen(false) } }}
                                    placeholder='Search this mailbox'
                                    aria-label='Search this mailbox'
                                    className={`${subtleInput} w-full pl-8 pr-8`}
                                />
                                <button type='button' aria-label='Close search' title='Close search' className='absolute right-2 top-2 text-ui-muted hover:text-ui-text' onClick={() => { setQuery(''); setSearchOpen(false) }}><X className='h-3.5 w-3.5' /></button>
                            </div>
                        ) : (
                            <button type='button' onClick={() => setSearchOpen(true)} aria-label='Search this mailbox (Cmd J)' title='Search this mailbox (Cmd J)' className='inline-flex h-8 items-center gap-1.5 rounded-md border border-ui-border bg-ui-raised px-2 text-[11px] text-ui-muted hover:border-ui-primary/50 hover:text-ui-text'>
                                <Search className='h-3.5 w-3.5' />
                                <span>Cmd J</span>
                            </button>
                        )}
                        <button
                            type='button'
                            data-testid='mail-compose-button'
                            disabled={!overview || loading || overview.actor.canSend === false}
                            className='inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-ui-primary px-3 text-xs font-semibold text-ui-on-primary shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45'
                            onClick={() => openComposer({ ...emptyComposer, open: true })}
                        >
                            <MailPlus className='h-3.5 w-3.5' />
                            Create
                        </button>
                    </div>
                </div>
            </DashboardPanel>

            {error && (
                <ErrorNotice
                    compact
                    variant='info'
                    title='Mail reconnecting'
                    message={error}
                    actionLabel='Retry'
                    onAction={() => void load({ mailboxUser, mailboxId: null, messageId: null })}
                />
            )}

            {showUnreachableWarning && backgroundIssue && (
                <ErrorNotice compact message={lastSuccessAt
                    ? `Background sync paused. Last successful update was ${formatRelativeTime(lastSuccessAt, now)} ago.`
                    : 'Server unavailable.'} />
            )}

            <div className={`grid min-w-0 grid-cols-1 gap-4 @3xl:min-h-0 @3xl:flex-1 ${sidebarCompact ? '@3xl:grid-cols-[80px_minmax(0,1fr)]' : '@3xl:grid-cols-[220px_minmax(0,1fr)]'}`}>
                <aside
                    className={`${dashboardPanelClass} relative overflow-hidden p-3 @3xl:min-h-0 @3xl:overflow-y-auto`}
                >
                    <div className='relative z-10'>
                        <div className='flex items-center justify-between pb-2'>
                            <div className='min-w-0'>
                                <p className='text-[10px] tracking-normal text-ui-muted'>Folders</p>
                            </div>
                            <div className='flex items-center gap-1'>
                                <button
                                    className={iconButton}
                                    title={sidebarCompact ? 'Expand folders' : 'Collapse folders'}
                                    onClick={() => setSidebarCompact(prev => !prev)}
                                >
                                    {sidebarCompact ? <PanelLeftOpen className='h-3.5 w-3.5' /> : <PanelLeftClose className='h-3.5 w-3.5' />}
                                </button>
                                <button
                                    className={iconButton}
                                    disabled={creatingMailbox}
                                    title='Create folder'
                                    onClick={() => setMailboxModalOpen(true)}
                                >
                                    <FolderInput className='h-3.5 w-3.5' />
                                </button>
                                <button
                                    className={iconButton}
                                    title='Mailbox admin'
                                    data-mail-admin-trigger
                                    onClick={() => setAdminDrawerOpen(true)}
                                >
                                    <Settings2 className='h-3.5 w-3.5' />
                                </button>
                            </div>
                        </div>

                        {!overview && loading ? <div role='status' aria-label='Loading mailboxes' className='mb-3 grid gap-2 border-b border-ui-border pb-3'>
                            {Array.from({ length: 5 }, (_, index) => <div key={index} aria-hidden='true' className='h-9 animate-pulse rounded-lg bg-ui-raised' />)}
                        </div> : null}
                        <nav aria-label='Mailboxes' className='mb-3 grid min-w-0 grid-cols-1 gap-1 border-b border-ui-border pb-3'>
                            {overview && overview.accessibleAccounts
                                .filter(account => !['admin', 'administrator'].includes(account.id.toLowerCase()) && account.name.toLowerCase() !== 'administrator')
                                .sort((a, b) => Number(b.id === overview.actor.id) - Number(a.id === overview.actor.id) || Number(Boolean(b.shared)) - Number(Boolean(a.shared)))
                                .map(account => (
                                    <button key={account.id} type='button' disabled={composer.open}
                                        aria-label={`Open ${account.shared ? account.name : account.id === overview.actor.id ? 'Inbox' : account.name}`}
                                        aria-current={overview.mailboxUser === account.id ? 'true' : undefined}
                                        title={composer.open ? 'Close the draft before opening another mailbox' : account.address}
                                        onClick={() => {
                                            setQuery('')
                                            setMailFilter('all')
                                            void load({ mailboxUser: account.id, mailboxId: null, messageId: null })
                                        }}
                                        className={`flex min-w-0 w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs disabled:opacity-50 ${overview.mailboxUser === account.id ? 'bg-ui-primary/10 font-semibold text-ui-primary' : 'text-ui-muted hover:bg-ui-raised'}`}>
                                        <span className='flex min-w-0 flex-1 items-center gap-2'><Inbox className='h-4 w-4 shrink-0' />
                                            {!sidebarCompact && <span className='truncate'>{account.shared ? account.name : account.id === overview.actor.id ? 'Inbox' : account.name}</span>}
                                        </span>
                                        {!sidebarCompact && <span className='shrink-0' aria-label={account.unreadCount == null ? 'Unread count unavailable' : `${account.unreadCount} unread`}>{account.unreadCount ?? '—'}</span>}
                                    </button>
                                ))}
                        </nav>
                        <div className='grid gap-1.5'>
                            {overview?.mailboxes.filter(mailbox => mailbox.role !== 'inbox').map(mailbox => (
                                <button
                                    key={mailbox.id}
                                    data-testid={`mail-mailbox-${mailbox.role || mailbox.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                                    onClick={() => {
                                        setSelectedMailboxId(mailbox.id)
                                        void load({ mailboxId: mailbox.id, messageId: null })
                                    }}
                                    className={`flex min-w-0 w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left text-xs transition ${
                                        selectedMailboxId === mailbox.id
                                            ? 'border-ui-primary bg-ui-primary/10 text-ui-on-primary'
                                            : 'border-transparent text-ui-muted hover:border-ui-border hover:bg-ui-raised hover:text-ui-text'
                                    }`}
                                    title={mailbox.name}
                                >
                                    <span className='inline-flex items-center gap-2 truncate'>
                                        {iconForMailbox(mailbox.role)}
                                        {!sidebarCompact && <span className='truncate'>{mailbox.name}</span>}
                                    </span>
                                    {!sidebarCompact && <span className='text-[10px] text-ui-muted'>{mailbox.unreadEmails || 0}</span>}
                                </button>
                            ))}
                        </div>
                    </div>
                </aside>

                {!readingMessage && <section data-mail-message-list className={`${dashboardPanelClass} min-w-0 p-2.5 @3xl:min-h-0 @3xl:overflow-y-auto`}>
                    <div className='flex items-center gap-2 px-1 pb-2 text-[10px] tracking-normal text-ui-muted'>
                        <span>{overview?.mailboxes.find(mailbox => mailbox.id === selectedMailboxId)?.name || 'Mailbox'}</span>
                        <span className='text-ui-muted'>•</span>
                        <span>{filteredMessages.length}</span>
                    </div>

                    <div className='mb-2 flex gap-1.5 overflow-x-auto pb-1' data-mail-filter-strip='true'>
                        {mailboxFilterOptions.map(option => (
                            <button
                                key={option.id}
                                type='button'
                                className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold transition ${
                                    mailFilter === option.id
                                        ? 'border-ui-primary bg-ui-primary/10 text-ui-primary'
                                        : 'border-ui-border bg-ui-raised text-ui-muted hover:border-ui-primary/35 hover:text-ui-text'
                                }`}
                                aria-pressed={mailFilter === option.id}
                                onClick={() => setMailFilter(option.id)}
                            >
                                <span>{option.label}</span>
                                <span className='rounded bg-ui-panel px-1.5 py-0.5 font-mono text-[10px]'>{option.count}</span>
                            </button>
                        ))}
                        {(selectionMode || !!filteredMessages.length) && <button type='button'
                            className='shrink-0 px-2.5 text-[11px] font-semibold text-ui-primary hover:underline'
                            aria-pressed={selectionMode} disabled={loading || archiving}
                            onClick={() => {
                                setSelectionMode(!selectionMode)
                                setCheckedMessages(new Set())
                            }}>
                            {selectionMode ? 'Hide' : 'Select'}
                        </button>}
                        {selectionMode && <button type='button'
                            className='shrink-0 px-2.5 text-[11px] font-semibold text-ui-primary hover:underline'
                            disabled={loading || archiving || !filteredMessages.length}
                            onClick={() => setCheckedMessages(allVisibleSelected ? new Set() : new Set(filteredMessages.map(message => message.id)))}>
                            {allVisibleSelected ? 'Unselect all' : 'Select all'}
                        </button>}
                    </div>

                    {!!checkedVisible.length && <div className='mb-2 flex flex-wrap items-center gap-3 px-1 text-xs text-ui-muted'>
                        <span role='status'>{checkedVisible.length} selected</span>
                        <button type='button' className={toolbarButton} disabled={archiving || loading} onClick={() => void archiveSelected()}>
                            <Archive className='h-4 w-4' />{archiving ? 'Archiving…' : 'Archive selected'}
                        </button>
                    </div>}
                    <div className='grid min-w-0 grid-cols-1 gap-1.5'>
                        {!overview && loading ? <div role='status' aria-label='Loading messages' className='grid gap-1.5'>
                            {Array.from({ length: 8 }, (_, index) => <div key={index} aria-hidden='true' className='h-[72px] animate-pulse rounded-lg border border-ui-border bg-ui-raised' />)}
                        </div> : null}
                        {searchPending && <p role='status' className='px-2 py-3 text-xs text-ui-muted'>Searching mailbox…</p>}
                        {searchError && <p role='alert' className='px-2 py-3 text-xs text-ui-text'>{searchError}</p>}
                        {filteredMessages.map(message => (
                            <MessageRow
                                key={`${overview?.mailboxUser}:${message.id}`}
                                archived={overview?.mailboxes.some(mailbox => message.mailboxIds.includes(mailbox.id) && (mailbox.role === 'archive' || /^archives?$/i.test(mailbox.name))) ?? false}
                                selectionMode={selectionMode}
                                checked={checkedMessages.has(message.id)}
                                selectionDisabled={loading || archiving}
                                onToggle={() => setCheckedMessages(current => {
                                    const next = new Set(current)
                                    if (next.has(message.id)) next.delete(message.id)
                                    else next.add(message.id)
                                    return next
                                })}
                                canSend={overview?.actor.canSend}
                                onAction={action => void quickAction(message, action)}
                                message={message}
                                active={selectedMessageId === message.id}
                                onClick={() => {
                                    setReadingMessage(true)
                                    setSelectedMessageId(message.id)
                                    void load({ messageId: message.id })
                                }}
                            />
                        ))}
                        <div ref={nextPageTrigger}>
                            {hasMoreMessages && <button type='button' className={toolbarButton} disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? 'Loading older messages…' : 'Load older messages'}</button>}
                            {pageError && <p role='alert' className='mt-2 text-xs text-ui-text'>{pageError}</p>}
                        </div>
                        {!filteredMessages.length && !loading && !searchPending && !searchError && (
                            <div className='rounded-lg border border-dashed border-ui-border px-3 py-4 text-xs text-ui-muted'>
                                {query || mailFilter !== 'all' ? 'No messages match the current view.' : 'The inbox is empty.'}
                            </div>
                        )}
                    </div>
                </section>}

                {readingMessage && <section ref={reader} data-mail-message-reader className={`${dashboardPanelClass} min-w-0 p-3 @3xl:flex @3xl:min-h-0 @3xl:flex-col @3xl:overflow-y-auto`}>
                    <button type='button' className={`${toolbarButton} mb-2 shrink-0 self-start`} onClick={() => setReadingMessage(false)}><ArrowLeft className='h-4 w-4' />Back to {overview?.mailboxes.find(mailbox => mailbox.id === selectedMailboxId)?.name || 'inbox'}</button>
                    {loading && <div role='status' className='px-2 py-6 text-xs text-ui-muted'>Loading message…</div>}
                    {!loading && !selectedMessage && <div className='rounded-lg border border-dashed border-ui-border px-4 py-8 text-xs text-ui-muted'>This message is unavailable. Return to the list or try opening it again.</div>}
                    {selectedMessage && overview && (
                        <div className='flex min-h-0 flex-1 flex-col gap-2'>
                            <div className='flex flex-wrap items-center justify-between gap-2 border-b border-ui-border pb-3'>
                                <div className='min-w-0'>
                                    <h2 className='truncate text-lg font-semibold tracking-[-0.03em] text-ui-text'>{selectedMessage.subject}</h2>
                                    <div className='mt-1 grid gap-0.5 text-[11px] text-ui-muted'>
                                        <p>From {selectedMessage.from.map(formatMailboxAddress).join(', ')}</p>
                                        <p>To {selectedMessage.to.map(formatMailboxAddress).join(', ')}</p>
                                        {!!selectedMessage.cc.length && <p>CC {selectedMessage.cc.map(formatMailboxAddress).join(', ')}</p>}
                                        <p>{formatDate(selectedMessage.receivedAt, true)}</p>
                                    </div>
                                </div>

                                <div className='flex flex-wrap items-center gap-1.5'>
                                    <ActionIconButton label='Reply' disabled={loading || overview?.actor.canSend === false} icon={<Reply className='h-3.5 w-3.5' />} onClick={() => openComposer(composeFromReply('reply', selectedMessage))} />
                                    <ActionIconButton label='Reply all' disabled={loading || overview?.actor.canSend === false} icon={<CornerUpLeft className='h-3.5 w-3.5' />} onClick={() => openComposer(composeFromReply('replyAll', selectedMessage, overview.mailboxAddress))} />
                                    <ActionIconButton label='Forward' disabled={loading || overview?.actor.canSend === false} icon={<Forward className='h-3.5 w-3.5' />} onClick={() => openComposer(composeFromReply('forward', selectedMessage))} />
                                    <ActionIconButton label={selectedMessage.isFlagged ? 'Unstar' : 'Star'} icon={<Star className='h-3.5 w-3.5' />} onClick={() => void performAction(selectedMessage.id, selectedMessage.isFlagged ? 'unflag' : 'flag')} />
                                    <ActionIconButton label='Archive' icon={<Archive className='h-3.5 w-3.5' />} onClick={() => void performAction(selectedMessage.id, 'archive')} />
                                    <ActionIconButton
                                        label={selectedMessage.isJunk ? 'Not spam' : 'Spam'}
                                        icon={selectedMessage.isJunk ? <Inbox className='h-3.5 w-3.5' /> : <ShieldAlert className='h-3.5 w-3.5' />}
                                        onClick={() => void performAction(selectedMessage.id, selectedMessage.isJunk ? 'ham' : 'junk')}
                                    />
                                    <ActionIconButton label='Trash' icon={<Trash2 className='h-3.5 w-3.5' />} onClick={() => void performAction(selectedMessage.id, 'trash')} />
                                </div>
                            </div>

                            {!!selectedMessage.attachments.length && (
                                <div className='rounded-lg border border-ui-border bg-ui-raised p-3'>
                                    <div className='mb-2 text-[11px] font-medium tracking-normal text-ui-muted'>Attachments</div>
                                    <div className='grid gap-2 lg:grid-cols-2'>
                                        {selectedMessage.attachments.map(attachment => (
                                            <div key={attachment.blobId}>
                                                <AttachmentPreview
                                                    attachment={attachment}
                                                    mailboxUser={overview.mailboxUser}
                                                    reputation={currentAttachmentReputations.get(attachment.blobId)}
                                                    checking={remoteContentPending}
                                                />
                                                <p className='mt-1 flex flex-wrap items-center gap-1 px-1 text-[10px] text-ui-muted' role='status'>
                                                    {remoteContentPending ? 'Checking VirusTotal by file hash…' : remoteContentError ? 'VirusTotal status unavailable.' : (() => {
                                                        const reputation = currentAttachmentReputations.get(attachment.blobId)
                                                        if (!reputation || reputation.status === 'unavailable') return 'VirusTotal status unavailable.'
                                                        if (reputation.status === 'unknown') return 'No VirusTotal report for this file hash.'
                                                        return <>
                                                            <span className={reputation.flagged ? 'text-ui-danger' : ''}>{reputation.flagged ? `Potential threat: ${reputation.flagged} / ${reputation.total ?? '?'} scanners flagged` : `VirusTotal: 0 / ${reputation.total ?? '?'} scanners flagged`}</span>
                                                            {reputation.reportUrl && <a href={reputation.reportUrl} target='_blank' rel='noopener noreferrer' className='underline'>Report</a>}
                                                        </>
                                                    })()}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {reportAttachments(selectedMessage).map(attachment => <DmarcReportPreview key={`${overview.mailboxUser}:${selectedMessage.id}:${attachment.blobId}`} attachment={attachment} mailboxUser={overview.mailboxUser} reputation={currentAttachmentReputations.get(attachment.blobId)} checking={remoteContentPending} />)}

                            {selectedMessage.htmlBody ? (
                                <>
                                {(remoteContentPending || remoteContentError || currentRemoteUrls.length > 0) && <div className='flex flex-wrap items-center gap-2 rounded-lg border border-ui-border bg-ui-raised px-3 py-2 text-[11px] text-ui-muted'>
                                    {remoteContentPending ? <span role='status'>Checking remote image safety…</span> : remoteContentError ? <span role='status'>{remoteContentError}</span> : <>
                                        <span>{currentRemoteHtml ? 'Safe remote images are loaded.' : `Remote images are blocked by default. ${safeRemoteImageUrls.length} safe image${safeRemoteImageUrls.length === 1 ? '' : 's'} available.`}</span>
                                        {safeRemoteImageUrls.length > 0 && <button type='button' className='rounded-md border border-ui-border px-2 py-1 text-ui-text hover:bg-ui-panel' onClick={() => {
                                            if (currentRemoteHtml) {
                                                setRemoteHtmlOverride(null)
                                                return
                                            }
                                            setRemoteHtmlOverride({ messageId: selectedMessage.id, html: htmlWithApprovedRemoteImages(withInlineAttachments(selectedMessage, overview?.mailboxUser || '', currentInlineAttachmentUrls), safeRemoteImageUrls) })
                                        }}>{currentRemoteHtml ? 'Hide remote images' : 'Load safe remote images'}</button>}
                                        {!currentRemoteHtml && safeRemoteImageUrls.length > 0 && <span>Loading requests these images from their external hosts and may reveal your IP address.</span>}
                                    </>}
                                </div>}
                                <iframe
                                    title='HTML mail'
                                    style={{ colorScheme: mailTheme, background: 'transparent' }}
                                    className='h-72 w-full shrink-0 rounded-lg border border-ui-border @3xl:min-h-40 @3xl:flex-1'
                                    sandbox='allow-popups allow-popups-to-escape-sandbox'
                                    srcDoc={renderedHtml}
                                />
                                </>
                            ) : selectedMessage.textBody ? (
                                <article className='min-w-0 wrap-anywhere rounded-lg border border-ui-border px-4 py-3 @3xl:min-h-40 @3xl:flex-1 @3xl:overflow-y-auto text-xs leading-5 whitespace-pre-wrap text-ui-text'>
                                    {selectedMessage.textBody}
                                </article>
                            ) : null}
                        </div>
                    )}
                </section>}
            </div>

            {composer.open && overview && (
                <Composer
                    state={composer}
                    now={now}
                    mailboxAddress={overview.mailboxAddress}
                    recentRecipients={overview.recentRecipients}
                    onChange={setComposer}
                    onClose={() => { sendIdempotencyKey.current = null; setComposer(emptyComposer) }}
                    onSubmit={async next => {
                        try {
                            sendIdempotencyKey.current ||= crypto.randomUUID()
                            const sendResult = await sendMail({
                                mailboxUser: overview.mailboxUser,
                                to: next.to,
                                cc: next.cc,
                                bcc: next.bcc,
                                subject: next.subject,
                                textBody: next.body,
                                attachments: next.attachments,
                            }, sendIdempotencyKey.current)
                            sendIdempotencyKey.current = null
                            setComposer(emptyComposer)
                            await load({
                                silent: true,
                                mailboxUser: sendResult?.mailboxUser || overview.mailboxUser,
                                mailboxId: sendResult?.sentMailboxId || selectedMailboxId,
                                messageId: sendResult?.sentMessageId || null,
                            })
                        } catch (cause) {
                            setError(cause instanceof Error ? cause.message : 'Unable to send mail.')
                        }
                    }}
                />
            )}
            {adminDrawerOpen && overview && (
                <div className='fixed inset-0 z-1300 flex justify-end bg-ui-canvas/70 p-3 backdrop-blur-sm' data-mail-admin-drawer>
                    <aside className='flex h-full w-full max-w-xl flex-col overflow-hidden rounded-lg border border-ui-border bg-ui-panel shadow-xl'>
                        <div className='flex items-start justify-between gap-3 border-b border-ui-border p-4'>
                            <div>
                                <p className='text-[10px] tracking-normal text-ui-muted'>Mailbox admin</p>
                                <h3 className='mt-1 text-lg font-semibold text-ui-text'>{overview.mailboxAddress}</h3>
                                <p className='mt-1 text-xs text-ui-muted'>Rules, delivery health, and client settings stay here so the mail stream stays focused.</p>
                            </div>
                            <button className={iconButton} onClick={() => setAdminDrawerOpen(false)} aria-label='Close mailbox admin'>
                                <Trash2 className='h-3.5 w-3.5 rotate-45' />
                            </button>
                        </div>

                        <div className='min-h-0 flex-1 overflow-y-auto p-4'>
                            <div className='grid gap-3'>
                                <section className='rounded-lg border border-ui-border bg-ui-raised p-3'>
                                    <div className='flex flex-wrap items-center justify-between gap-2'>
                                        <div>
                                            <p className='text-sm font-semibold text-ui-text'>Filing rules</p>
                                            <p className='mt-1 text-xs text-ui-muted'>Create automatic moves without adding noise to daily triage.</p>
                                        </div>
                                        <span className='rounded-md border border-ui-border bg-ui-panel px-2 py-1 text-[11px] text-ui-muted'>{overview.filters.length} active</span>
                                    </div>
                                    <form
                                        className='mt-3 grid gap-2 sm:grid-cols-2'
                                        onSubmit={async (event) => {
                                            event.preventDefault()
                                            const formData = new FormData(event.currentTarget)
                                            setCreatingFilter(true)
                                            try {
                                                await createFilter({
                                                    mailboxUser: overview.mailboxUser,
                                                    name: String(formData.get('name') || 'Rule'),
                                                    criteria: {
                                                        field: String(formData.get('field') || 'subject') as 'from' | 'subject' | 'body' | 'senderDomain',
                                                        contains: String(formData.get('contains') || ''),
                                                    },
                                                    action: {
                                                        type: 'move',
                                                        mailboxName: String(formData.get('mailboxName') || 'Archive'),
                                                        markRead: Boolean(formData.get('markRead')),
                                                    },
                                                })
                                                event.currentTarget.reset()
                                                await load()
                                            } catch (cause) {
                                                setError(cause instanceof Error ? cause.message : 'Unable to save filter.')
                                            } finally {
                                                setCreatingFilter(false)
                                            }
                                        }}
                                    >
                                        <input name='name' required placeholder='Invoice filing' className={`${subtleInput} w-full`} />
                                        <select name='field' className={`${subtleInput} w-full`}>
                                            <option value='subject'>Subject</option>
                                            <option value='from'>From</option>
                                            <option value='body'>Body</option>
                                            <option value='senderDomain'>Sender domain</option>
                                        </select>
                                        <input name='contains' required placeholder='contains...' className={`${subtleInput} w-full`} />
                                        <input name='mailboxName' required placeholder='target folder' className={`${subtleInput} w-full`} />
                                        <label className='inline-flex items-center gap-2 text-[11px] text-ui-muted sm:col-span-2'>
                                            <input type='checkbox' name='markRead' className='h-3.5 w-3.5 rounded border-ui-border bg-ui-raised' />
                                            Mark read after moving
                                        </label>
                                        <button className={`${toolbarButton} justify-center sm:col-span-2`} disabled={creatingFilter}>
                                            Save rule
                                        </button>
                                    </form>

                                    {!!overview.filters.length && (
                                        <div className='mt-3 grid gap-2'>
                                            {overview.filters.map(rule => (
                                                <div key={rule.id} className='rounded-lg border border-ui-border bg-ui-panel px-3 py-2'>
                                                    <div className='flex items-start justify-between gap-2'>
                                                        <div className='min-w-0'>
                                                            <p className='truncate text-xs font-medium text-ui-text'>{rule.name}</p>
                                                            <p className='mt-1 text-[11px] leading-4 text-ui-muted'>
                                                                {rule.criteria.field} contains {rule.criteria.contains} to {rule.action.mailboxName}
                                                            </p>
                                                        </div>
                                                        <button
                                                            className='text-[11px] text-ui-text hover:underline'
                                                            onClick={async () => {
                                                                try {
                                                                    await deleteFilter(rule.id, overview.mailboxUser)
                                                                    await load()
                                                                } catch (cause) {
                                                                    setError(cause instanceof Error ? cause.message : 'Unable to delete filter.')
                                                                }
                                                            }}
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </section>

                                <section className='rounded-lg border border-ui-border bg-ui-raised p-3'>
                                    <div className='flex flex-wrap items-center justify-between gap-2'>
                                        <div>
                                            <p className='text-sm font-semibold text-ui-text'>Mail health</p>
                                            <p className='mt-1 text-xs text-ui-muted'>Delivery checks and queue state for this mailbox.</p>
                                        </div>
                                        <span className={`rounded-full px-2 py-0.5 text-[11px] ${
                                            overview.health?.status === 'healthy'
                                                ? 'bg-ui-success/15 text-ui-success'
                                                : overview.health?.status === 'warning'
                                                    ? 'bg-ui-warning/15 text-ui-warning'
                                                    : 'bg-ui-raised/15 text-ui-text'
                                        }`}
                                        >
                                            {overview.health?.status || 'unknown'}
                                        </span>
                                    </div>
                                    {overview.health && (
                                        <div className='mt-3'>
                                            <MailSyncStatus lastSuccessAt={lastSuccessAt} unreachableSince={unreachableSince} now={now} full />
                                            <div className='flex flex-wrap items-center justify-between gap-2 text-[11px] text-ui-muted'>
                                                <span className='inline-flex items-center gap-1.5'>
                                                    <Radar className='h-3.5 w-3.5' />
                                                    Checked {formatDate(overview.health.checkedAt)}
                                                </span>
                                                <span>
                                                    Queue {overview.health.queueDepth} · banner {overview.health.smtpBannerLatencyMs ?? '-'}ms
                                                </span>
                                            </div>
                                            <div className='mt-2 grid gap-2'>
                                                {overview.health.checks.map(check => (
                                                    <div key={check.id} className='rounded-lg border border-ui-border bg-ui-panel px-3 py-2'>
                                                        <div className='flex items-center justify-between gap-2'>
                                                            <p className='min-w-0 wrap-break-word text-xs font-medium text-ui-text'>{check.label}</p>
                                                            <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                                                                check.status === 'healthy'
                                                                    ? 'bg-ui-success/15 text-ui-success'
                                                                    : check.status === 'warning'
                                                                        ? 'bg-ui-warning/15 text-ui-warning'
                                                                        : 'bg-ui-raised/15 text-ui-text'
                                                            }`}
                                                            >
                                                                {check.status}
                                                            </span>
                                                        </div>
                                                        <p className='mt-1 wrap-break-word text-[11px] leading-4 text-ui-muted'>{check.detail}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </section>

                                <section className='rounded-lg border border-ui-border bg-ui-raised p-3'>
                                    <div className='flex items-start gap-2'>
                                        <ShieldCheck className='mt-0.5 h-4 w-4 text-ui-muted' />
                                        <div className='min-w-0 text-[11px] leading-5 text-ui-muted'>
                                            <p className='text-sm font-semibold text-ui-text'>Client access</p>
                                            <p className='mt-2'>IMAP {overview.settings.imapHost}:{overview.settings.imapPort}</p>
                                            <p>SMTP {overview.settings.smtpHost}:{overview.settings.smtpPort}</p>
                                            <p>ManageSieve {overview.settings.host}:{overview.settings.managesievePort}</p>
                                            <p className='mt-1'>Username {overview.settings.username}</p>
                                            <p>Address {overview.settings.address}</p>
                                            <p>Password is hidden. Rotate client credentials from account settings.</p>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        </div>
                    </aside>
                </div>
            )}
            {mailboxModalOpen && overview && (
                <div className='fixed inset-0 z-1300 grid place-items-center bg-ui-canvas/75 p-4 backdrop-blur-sm'>
                    <div className='w-full max-w-md rounded-lg border border-ui-border bg-ui-panel p-5 shadow-xl'>
                        <div className='flex items-center justify-between gap-3'>
                            <div>
                                <p className='text-[10px] tracking-normal text-ui-muted'>Mailbox</p>
                                <h3 className='mt-1 text-lg font-semibold text-ui-text'>Create folder</h3>
                            </div>
                            <button className={iconButton} onClick={() => { setMailboxModalOpen(false); setMailboxDraft('') }}>
                                <Trash2 className='h-3.5 w-3.5 rotate-45' />
                            </button>
                        </div>
                        <div className='mt-4 grid gap-3'>
                            <input
                                value={mailboxDraft}
                                onChange={(event) => setMailboxDraft(event.target.value)}
                                placeholder='Projects, Receipts, Alerts...'
                                className='rounded-lg border border-ui-border bg-ui-raised px-3 py-2.5 text-sm text-ui-text outline-none placeholder:text-ui-muted focus:border-ui-primary'
                            />
                            <div className='flex justify-end gap-2'>
                                <button className={toolbarButton} onClick={() => { setMailboxModalOpen(false); setMailboxDraft('') }}>
                                    Cancel
                                </button>
                                <button
                                    className='inline-flex items-center justify-center rounded-lg bg-ui-primary px-4 py-2 text-sm font-semibold text-ui-on-primary transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60'
                                    disabled={!mailboxDraft.trim() || creatingMailbox}
                                    onClick={async () => {
                                        setCreatingMailbox(true)
                                        try {
                                            await createMailbox({ mailboxUser: overview.mailboxUser, name: mailboxDraft.trim() })
                                            setMailboxModalOpen(false)
                                            setMailboxDraft('')
                                            await load()
                                        } catch (cause) {
                                            setError(cause instanceof Error ? cause.message : 'Unable to create mailbox.')
                                        } finally {
                                            setCreatingMailbox(false)
                                        }
                                    }}
                                >
                                    {creatingMailbox ? 'Creating...' : 'Create'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </DashboardPage>
    )
}

function MailSyncStatus({
    lastSuccessAt,
    now,
    unreachableSince,
    full = false,
}: {
    lastSuccessAt: number | null
    now: number
    unreachableSince: number | null
    full?: boolean
}) {
    if (!unreachableSince || now - unreachableSince < STALE_AFTER_MS) return null
    const updated = lastSuccessAt ? new Date(lastSuccessAt) : null
    const today = new Date(now)
    const time = updated ? `${String(updated.getHours()).padStart(2, '0')}:${String(updated.getMinutes()).padStart(2, '0')}` : '--:--'
    const date = updated && updated.toDateString() !== today.toDateString() ? ` · ${String(updated.getDate()).padStart(2, '0')}:${String(updated.getMonth() + 1).padStart(2, '0')}` : ''
    return (
        <div className={`${full ? 'mb-3 flex' : 'hidden sm:flex'} min-w-0 items-center rounded-md border border-ui-danger/40 bg-ui-raised/10 px-2 py-1 text-[11px] text-ui-text`} data-mail-sync-status>
            <span className='truncate'>Last updated {time}{date}</span>
        </div>
    )
}

function buildMailListFilters(messages: MailMessageSummary[]): Array<{ id: MailListFilter, label: string, count: number }> {
    return [
        { id: 'all', label: 'All', count: messages.length },
        { id: 'unread', label: 'Unread', count: messages.filter(message => !message.isRead).length },
        { id: 'starred', label: 'Starred', count: messages.filter(message => message.isFlagged).length },
        { id: 'attachments', label: 'Attachments', count: messages.filter(message => message.hasAttachment).length },
    ]
}

function messageMatchesMailFilter(message: MailMessageSummary, filter: MailListFilter) {
    if (filter === 'unread') return !message.isRead
    if (filter === 'starred') return message.isFlagged
    if (filter === 'attachments') return message.hasAttachment
    return true
}
