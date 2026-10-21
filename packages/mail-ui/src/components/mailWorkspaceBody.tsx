'use client'

import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { MailMessage } from '../types'
import { MailWorkspaceToolbar } from './mailWorkspaceToolbar'
import { MailboxSidebar } from './mailboxSidebar'
import { MailMessageList } from './mailMessageList'
import { MailMessageReader } from './mailMessageReader'
import type { useMailMessageContent } from './useMailMessageContent'
import type { useMailWorkspaceActions } from './useMailWorkspaceActions'
import type { useMailWorkspaceOverview } from './useMailWorkspaceOverview'
import type { useMailWorkspaceSearch } from './useMailWorkspaceSearch'
import { formatRelativeTime } from './utils'
import { MAIL_STALE_AFTER_MS } from './mailWorkspaceStatus'

type Data = ReturnType<typeof useMailWorkspaceOverview>
type Search = ReturnType<typeof useMailWorkspaceSearch>
type Actions = ReturnType<typeof useMailWorkspaceActions>
type Content = ReturnType<typeof useMailMessageContent>

export function MailWorkspaceBody({ data, search, actions, content, mailboxUser, sidebarCompact, setSidebarCompact, readingMessage, setReadingMessage, reader, mailboxModalOpen, setMailboxModalOpen, adminDrawerOpen, setAdminDrawerOpen, composerOpen, creatingMailbox, theme, onCompose, onComposeReply }: {
    data: Data
    search: Search
    actions: Actions
    content: Content
    mailboxUser?: string | null
    sidebarCompact: boolean
    setSidebarCompact: Dispatch<SetStateAction<boolean>>
    readingMessage: boolean
    setReadingMessage: (value: boolean) => void
    reader: RefObject<HTMLElement | null>
    mailboxModalOpen: boolean
    setMailboxModalOpen: (value: boolean) => void
    adminDrawerOpen: boolean
    setAdminDrawerOpen: (value: boolean) => void
    composerOpen: boolean
    creatingMailbox: boolean
    theme: 'light' | 'dark'
    onCompose: () => void
    onComposeReply: (action: 'reply' | 'replyAll' | 'forward', message: MailMessage, address?: string) => void
}) {
    const { overview, loading, error, backgroundIssue, lastSuccessAt, unreachableSince, now, load, selectedMailboxId, setSelectedMailboxId, selectedMessageId, setSelectedMessageId } = data
    const { query, setQuery, mailFilter, setMailFilter, searchPending, searchError, loadingMore, pageError, nextPageTrigger, filteredMessages, mailboxFilterOptions, hasMoreMessages, loadMore } = search
    const { selectionMode, setSelectionMode, checkedMessages, setCheckedMessages, archiving, quickAction, performAction, archiveSelected } = actions
    const selectedMessage = overview?.selectedMessage?.id === selectedMessageId ? overview.selectedMessage : null
    const checkedVisible = filteredMessages.filter(message => checkedMessages.has(message.id))
    const allVisibleSelected = filteredMessages.length > 0 && checkedVisible.length === filteredMessages.length
    const unreadCount = overview?.accessibleAccounts.find(account => account.id === overview.actor.id)?.unreadCount ?? 0
    const showUnreachableWarning = Boolean(unreachableSince && now - unreachableSince >= MAIL_STALE_AFTER_MS)

    return (
        <main
            className='@container !gap-4 !px-2 !py-4 text-ui-text'
            style={{ display: 'flex', height: '100%', minHeight: 0, flexDirection: 'column' }}
        >
            <MailWorkspaceToolbar
                overview={overview}
                selectedMailboxId={selectedMailboxId}
                unreadCount={unreadCount}
                visibleCount={filteredMessages.length}
                lastSuccessAt={lastSuccessAt}
                unreachableSince={unreachableSince}
                now={now}
                searchOpen={search.searchOpen}
                query={query}
                searchInput={search.searchInput}
                loading={loading}
                onAccountChange={user => {
                    setQuery('')
                    setMailFilter('all')
                    void load({ mailboxUser: user, mailboxId: null, messageId: null })
                }}
                onMailboxChange={mailboxId => {
                    setSelectedMailboxId(mailboxId)
                    void load({ mailboxId, messageId: null })
                }}
                onQueryChange={setQuery}
                onSearchOpenChange={search.setSearchOpen}
                onCompose={onCompose}
            />
            {error && (
                <div role='alert' className='flex items-center gap-3 rounded-lg border border-ui-warning/40 bg-ui-warning/10 px-3 py-2 text-sm text-ui-text'>
                    <div className='min-w-0 flex-1'>
                        <p className='font-semibold'>Mail reconnecting</p>
                        <p>{error}</p>
                    </div>
                    <button type='button' onClick={() => void load({ mailboxUser, mailboxId: null, messageId: null })} className='font-medium text-ui-primary'>Retry</button>
                </div>
            )}
            {showUnreachableWarning && backgroundIssue && (
                <p role='status' className='rounded-lg border border-ui-border bg-ui-panel px-3 py-2 text-xs text-ui-muted'>
                    {lastSuccessAt ? `Background sync paused. Last successful update was ${formatRelativeTime(lastSuccessAt, now)} ago.` : 'Server unavailable.'}
                </p>
            )}
            <div className={`grid min-w-0 grid-cols-1 gap-4 @3xl:min-h-0 @3xl:flex-1 ${sidebarCompact ? '@3xl:grid-cols-[80px_minmax(0,1fr)]' : '@3xl:grid-cols-[220px_minmax(0,1fr)]'}`}>
                <MailboxSidebar
                    overview={overview}
                    loading={loading}
                    compact={sidebarCompact}
                    selectedMailboxId={selectedMailboxId}
                    composerOpen={composerOpen}
                    creatingMailbox={creatingMailbox}
                    onToggleCompact={() => setSidebarCompact(previous => !previous)}
                    onCreateFolder={() => setMailboxModalOpen(true)}
                    onAdmin={() => setAdminDrawerOpen(true)}
                    onSelectAccount={user => {
                        setQuery('')
                        setMailFilter('all')
                        void load({ mailboxUser: user, mailboxId: null, messageId: null })
                    }}
                    onSelectFolder={mailboxId => {
                        setSelectedMailboxId(mailboxId)
                        void load({ mailboxId, messageId: null })
                    }}
                />
                <MailMessageList
                    readingMessage={readingMessage}
                    overview={overview}
                    selectedMailboxId={selectedMailboxId}
                    filteredMessages={filteredMessages}
                    mailboxFilterOptions={mailboxFilterOptions}
                    mailFilter={mailFilter}
                    setMailFilter={setMailFilter}
                    selectionMode={selectionMode}
                    setSelectionMode={setSelectionMode}
                    checkedMessages={checkedMessages}
                    setCheckedMessages={setCheckedMessages}
                    checkedVisible={checkedVisible}
                    allVisibleSelected={allVisibleSelected}
                    loading={loading}
                    archiving={archiving}
                    archiveSelected={() => archiveSelected(checkedVisible)}
                    searchPending={searchPending}
                    searchError={searchError}
                    query={query}
                    selectedMessageId={selectedMessageId}
                    onQuickAction={quickAction}
                    onReadMessage={messageId => {
                        setReadingMessage(true)
                        setSelectedMessageId(messageId)
                        void load({ messageId })
                    }}
                    nextPageTrigger={nextPageTrigger}
                    hasMoreMessages={hasMoreMessages}
                    loadingMore={loadingMore}
                    loadMore={loadMore}
                    pageError={pageError}
                />
                <MailMessageReader
                    readingMessage={readingMessage}
                    reader={reader}
                    overview={overview}
                    selectedMailboxId={selectedMailboxId}
                    loading={loading}
                    theme={theme}
                    selectedMessage={selectedMessage}
                    content={content}
                    onBack={() => setReadingMessage(false)}
                    onReply={action => {
                        if (selectedMessage) onComposeReply(action, selectedMessage, action === 'replyAll' ? overview?.mailboxAddress : undefined)
                    }}
                    onAction={(id, action) => void performAction(id, action)}
                />
            </div>
        </main>
    )
}
