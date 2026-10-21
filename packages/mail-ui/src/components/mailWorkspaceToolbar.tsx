'use client'

import type { RefObject } from 'react'
import { MailPlus, Search, X } from 'lucide-react'
import type { MailOverview } from '../types'
import { MailSelect } from './mailSelect'
import { MailSyncStatus } from './mailWorkspaceStatus'
import { subtleInput } from './utils'

type Props = {
    overview: MailOverview | null
    selectedMailboxId: string | null
    unreadCount: number
    visibleCount: number
    lastSuccessAt: number | null
    unreachableSince: number | null
    now: number
    searchOpen: boolean
    query: string
    searchInput: RefObject<HTMLInputElement | null>
    loading: boolean
    onAccountChange: (user: string) => void
    onMailboxChange: (mailboxId: string) => void
    onQueryChange: (query: string) => void
    onSearchOpenChange: (open: boolean) => void
    onCompose: () => void
}

export function MailWorkspaceToolbar({ overview, selectedMailboxId, unreadCount, visibleCount, lastSuccessAt, unreachableSince, now, searchOpen, query, searchInput, loading, onAccountChange, onMailboxChange, onQueryChange, onSearchOpenChange, onCompose }: Props) {
    return (
<section className='rounded-lg border border-ui-border bg-ui-panel shadow-sm shadow-ui-canvas/10 dark:shadow-ui-canvas/20 flex shrink-0 flex-wrap items-center gap-2 p-2.5 sm:p-3' id='mail-toolbar'>
                <div className='flex min-w-0 flex-1 flex-wrap items-center gap-2'>
                    <div className='mr-auto flex h-8 min-w-0 flex-col justify-center'>
                        <p className='text-xs leading-4 text-ui-muted'>Mailbox</p>
                        {overview ? <p className='truncate text-xs leading-4 text-ui-muted'>{overview.mailboxAddress || 'Communication'}</p> : <span aria-hidden='true' className='mt-1 block h-3 w-28 animate-pulse rounded bg-ui-raised' />}
                    </div>
                    {overview?.accessibleAccounts.length ? <MailSelect
                        id='mail-account-mobile'
                        label='Mail account'
                        value={overview.mailboxUser}
                        onChange={user => { onAccountChange(user) }}
                        options={overview.accessibleAccounts
                            .filter(account => !['admin', 'administrator'].includes(account.id.toLowerCase()) && account.name.toLowerCase() !== 'administrator')
                            .map(account => ({
                                id: account.id,
                                label: account.name || account.address,
                                description: account.address && account.address !== account.name ? account.address : undefined,
                            }))}
                        compact
                        className='w-36 @3xl:hidden'
                    /> : null}
                    {overview?.mailboxes.length ? <MailSelect
                        id='mail-folder-mobile'
                        label='Mail folder'
                        value={selectedMailboxId || overview.selectedMailboxId || ''}
                        onChange={mailboxId => { onMailboxChange(mailboxId) }}
                        options={overview.mailboxes.map(mailbox => ({ id: mailbox.id, label: mailbox.name }))}
                        compact
                        className='w-32 @3xl:hidden'
                    /> : null}
                    <div className='flex flex-wrap items-center gap-2 text-xs font-semibold text-ui-muted' data-mail-counts>
                        {overview ? <>
                            <span className='inline-flex h-8 items-center rounded-md border border-ui-border bg-ui-raised px-2'>{unreadCount} unread</span>
                            <span className='inline-flex h-8 items-center rounded-md border border-ui-border bg-ui-raised px-2'>{visibleCount} visible</span>
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
                                    onChange={event => onQueryChange(event.target.value)}
                                    onKeyDown={event => { if (event.key === 'Escape') { onQueryChange(''); onSearchOpenChange(false) } }}
                                    placeholder='Search this mailbox'
                                    aria-label='Search this mailbox'
                                    className={`${subtleInput} w-full pl-8 pr-8`}
                                />
                                <button type='button' aria-label='Close search' title='Close search' className='absolute right-2 top-2 text-ui-muted hover:text-ui-text' onClick={() => { onQueryChange(''); onSearchOpenChange(false) }}><X className='h-3.5 w-3.5' /></button>
                            </div>
                        ) : (
                            <button type='button' onClick={() => onSearchOpenChange(true)} aria-label='Search this mailbox (Cmd J)' title='Search this mailbox (Cmd J)' className='inline-flex h-8 items-center gap-1.5 rounded-md border border-ui-border bg-ui-raised px-2 text-[11px] text-ui-muted hover:border-ui-primary/50 hover:text-ui-text'>
                                <Search className='h-3.5 w-3.5' />
                                <span>Cmd J</span>
                            </button>
                        )}
                        <button
                            type='button'
                            data-testid='mail-compose-button'
                            disabled={!overview || overview.actor.canSend === false}
                            className='inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-ui-primary px-3 text-xs font-semibold text-ui-on-primary shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45'
                            onClick={onCompose}
                        >
                            <MailPlus className='h-3.5 w-3.5' />
                            Create
                        </button>
                    </div>
                </div>
            </section>
    )
}
