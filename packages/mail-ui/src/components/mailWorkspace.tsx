'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMailUiApi } from '../api'
import { useMailMessageContent } from './useMailMessageContent'
import { MailWorkspaceBody } from './mailWorkspaceBody'
import { MailWorkspaceOverlays } from './mailWorkspaceOverlays'
import { useMailWorkspaceActions } from './useMailWorkspaceActions'
import { useMailWorkspaceOverview } from './useMailWorkspaceOverview'
import { useMailWorkspaceSearch } from './useMailWorkspaceSearch'
import { composeFromReply, emptyComposer, type ComposerState } from './utils'

type Props = { mailboxUser?: string | null }

export default function MailWorkspace({ mailboxUser }: Props) {
    const api = useMailUiApi()
    const [mailTheme, setMailTheme] = useState<'light' | 'dark'>('light')
    const [readingMessage, setReadingMessage] = useState(false)
    const [composer, setComposer] = useState<ComposerState>(emptyComposer)
    const [creatingMailbox, setCreatingMailbox] = useState(false)
    const [mailboxModalOpen, setMailboxModalOpen] = useState(false)
    const [adminDrawerOpen, setAdminDrawerOpen] = useState(false)
    const [sidebarCompact, setSidebarCompact] = useState(false)
    const [selectionMode, setSelectionMode] = useState(false)
    const [checkedMessages, setCheckedMessages] = useState<Set<string>>(new Set())
    const [pageError, setPageError] = useState('')
    const reader = useRef<HTMLElement>(null)
    const sendIdempotencyKey = useRef<string | null>(null)

    useEffect(() => {
        const root = document.documentElement
        const update = () => setMailTheme(root.classList.contains('dark') ? 'dark' : 'light')
        update()
        const observer = new MutationObserver(update)
        observer.observe(root, { attributes: true, attributeFilter: ['class'] })
        return () => observer.disconnect()
    }, [])
    useEffect(() => { if (readingMessage) reader.current?.scrollIntoView({ block: 'start' }) }, [readingMessage])

    const onMailboxChange = useCallback(() => {
        setPageError('')
        setCheckedMessages(new Set())
        setSelectionMode(false)
    }, [])
    const onBack = useCallback(() => setReadingMessage(false), [])
    const data = useMailWorkspaceOverview({ api, mailboxUser, onMailboxChange, onBack })
    const search = useMailWorkspaceSearch({
        api,
        overview: data.overview,
        setOverview: data.setOverview,
        requestVersion: data.requestVersion,
        selection: data.selection,
        requestPending: data.requestPending,
        paginationPending: data.paginationPending,
        pageError,
        setPageError,
    })
    const openComposer = useCallback((state: ComposerState) => {
        sendIdempotencyKey.current = null
        setComposer(state)
    }, [])
    const actions = useMailWorkspaceActions({
        api,
        overview: data.overview,
        loading: data.loading,
        load: data.load,
        setError: data.setError,
        setSearchRefresh: search.setSearchRefresh,
        setOverview: data.setOverview,
        selection: data.selection,
        archivingRef: data.archivingRef,
        onCompose: openComposer,
        selectionMode,
        setSelectionMode,
        checkedMessages,
        setCheckedMessages,
        requestVersion: data.requestVersion,
    })
    const selectedMessage = data.overview?.selectedMessage?.id === data.selectedMessageId ? data.overview.selectedMessage : null
    const content = useMailMessageContent({ api, message: selectedMessage, overview: data.overview, theme: mailTheme })

    return <>
        <MailWorkspaceBody
            data={data}
            search={search}
            actions={actions}
            content={content}
            mailboxUser={mailboxUser}
            sidebarCompact={sidebarCompact}
            setSidebarCompact={setSidebarCompact}
            readingMessage={readingMessage}
            setReadingMessage={setReadingMessage}
            reader={reader}
            mailboxModalOpen={mailboxModalOpen}
            setMailboxModalOpen={setMailboxModalOpen}
            adminDrawerOpen={adminDrawerOpen}
            setAdminDrawerOpen={setAdminDrawerOpen}
            composerOpen={composer.open}
            creatingMailbox={creatingMailbox}
            theme={mailTheme}
            onCompose={() => openComposer({ ...emptyComposer, open: true })}
            onComposeReply={(action, message, address) => openComposer(composeFromReply(action, message, address))}
        />
        <MailWorkspaceOverlays
            api={api}
            overview={data.overview}
            now={data.now}
            selectedMailboxId={data.selectedMailboxId}
            composer={composer}
            setComposer={setComposer}
            load={data.load}
            setError={data.setError}
            lastSuccessAt={data.lastSuccessAt}
            unreachableSince={data.unreachableSince}
            adminOpen={adminDrawerOpen}
            setAdminOpen={setAdminDrawerOpen}
            mailboxOpen={mailboxModalOpen}
            setMailboxOpen={setMailboxModalOpen}
            creatingMailbox={creatingMailbox}
            setCreatingMailbox={setCreatingMailbox}
            sendIdempotencyKey={sendIdempotencyKey}
        />
    </>
}
