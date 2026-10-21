'use client'

import type { Dispatch, RefObject, SetStateAction } from 'react'
import { Archive } from 'lucide-react'
import { MessageRow, type MailQuickAction } from './mailMessageRow'
import type { MailMessageSummary, MailOverview } from '../types'
import { toolbarButton } from './utils'
import type { MailListFilter } from './mailWorkspaceStatus'

type Props = {
    readingMessage: boolean
    overview: MailOverview | null
    selectedMailboxId: string | null
    filteredMessages: MailMessageSummary[]
    mailboxFilterOptions: Array<{ id: MailListFilter, label: string, count: number }>
    mailFilter: MailListFilter
    setMailFilter: Dispatch<SetStateAction<MailListFilter>>
    selectionMode: boolean
    setSelectionMode: Dispatch<SetStateAction<boolean>>
    checkedMessages: Set<string>
    setCheckedMessages: Dispatch<SetStateAction<Set<string>>>
    checkedVisible: MailMessageSummary[]
    allVisibleSelected: boolean
    loading: boolean
    archiving: boolean
    archiveSelected: () => Promise<void>
    searchPending: boolean
    searchError: string
    query: string
    selectedMessageId: string | null
    onQuickAction: (message: MailMessageSummary, action: MailQuickAction) => void
    onReadMessage: (messageId: string) => void
    nextPageTrigger: RefObject<HTMLDivElement | null>
    hasMoreMessages: boolean
    loadingMore: boolean
    loadMore: () => Promise<void>
    pageError: string
}

export function MailMessageList(props: Props) {
    const { readingMessage, overview, selectedMailboxId, filteredMessages, mailboxFilterOptions, mailFilter, setMailFilter, selectionMode, setSelectionMode, checkedMessages, setCheckedMessages, checkedVisible, allVisibleSelected, loading, archiving, archiveSelected, searchPending, searchError, query, selectedMessageId, onQuickAction, onReadMessage, nextPageTrigger, hasMoreMessages, loadingMore, loadMore, pageError } = props
    return (
        <>
        {!readingMessage && (
<section data-mail-message-list className='rounded-lg border border-ui-border bg-ui-panel shadow-sm shadow-ui-canvas/10 dark:shadow-ui-canvas/20 min-w-0 p-2.5 @3xl:min-h-0 @3xl:overflow-y-auto'>
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
                                onAction={action => void onQuickAction(message, action)}
                                message={message}
                                active={selectedMessageId === message.id}
                                onClick={() => {
                                    onReadMessage(message.id)
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
                </section>
        )}
        </>
    )
}
