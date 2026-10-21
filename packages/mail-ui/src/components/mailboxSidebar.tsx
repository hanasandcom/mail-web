'use client'

import { Inbox, PanelLeftClose, PanelLeftOpen, Settings2, FolderInput } from 'lucide-react'
import type { MailOverview } from '../types'
import { iconButton, iconForMailbox } from './utils'

type Props = {
    overview: MailOverview | null
    loading: boolean
    compact: boolean
    selectedMailboxId: string | null
    composerOpen: boolean
    creatingMailbox: boolean
    onToggleCompact: () => void
    onCreateFolder: () => void
    onAdmin: () => void
    onSelectAccount: (user: string) => void
    onSelectFolder: (mailboxId: string) => void
}

export function MailboxSidebar({ overview, loading, compact, selectedMailboxId, composerOpen, creatingMailbox, onToggleCompact, onCreateFolder, onAdmin, onSelectAccount, onSelectFolder }: Props) {
    return (
<aside className='rounded-lg border border-ui-border bg-ui-panel shadow-sm shadow-ui-canvas/10 dark:shadow-ui-canvas/20 relative overflow-hidden p-3 @3xl:min-h-0 @3xl:overflow-y-auto'>
                    <div className='relative z-10'>
                        <div className='flex items-center justify-between pb-2'>
                            <div className='min-w-0'>
                                <p className='text-[10px] tracking-normal text-ui-muted'>Folders</p>
                            </div>
                            <div className='flex items-center gap-1'>
                                <button
                                    className={iconButton}
                                    title={compact ? 'Expand folders' : 'Collapse folders'}
                                    onClick={() => onToggleCompact}
                                >
                                    {compact ? <PanelLeftOpen className='h-3.5 w-3.5' /> : <PanelLeftClose className='h-3.5 w-3.5' />}
                                </button>
                                <button
                                    className={iconButton}
                                    disabled={creatingMailbox}
                                    title='Create folder'
                                    onClick={() => onCreateFolder}
                                >
                                    <FolderInput className='h-3.5 w-3.5' />
                                </button>
                                <button
                                    className={iconButton}
                                    title='Mailbox admin'
                                    data-mail-admin-trigger
                                    onClick={() => onAdmin}
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
                                    <button key={account.id} type='button' disabled={composerOpen}
                                        aria-label={`Open ${account.shared ? account.name : account.id === overview.actor.id ? 'Inbox' : account.name}`}
                                        aria-current={overview.mailboxUser === account.id ? 'true' : undefined}
                                        title={composerOpen ? 'Close the draft before opening another mailbox' : account.address}
                                        onClick={() => {
                                            onSelectAccount(account.id)
                                        }}
                                        className={`flex min-w-0 w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs disabled:opacity-50 ${overview.mailboxUser === account.id ? 'bg-ui-primary/10 font-semibold text-ui-primary' : 'text-ui-muted hover:bg-ui-raised'}`}>
                                        <span className='flex min-w-0 flex-1 items-center gap-2'><Inbox className='h-4 w-4 shrink-0' />
                                            {!compact && <span className='truncate'>{account.shared ? account.name : account.id === overview.actor.id ? 'Inbox' : account.name}</span>}
                                        </span>
                                        {!compact && <span className='shrink-0' aria-label={account.unreadCount == null ? 'Unread count unavailable' : `${account.unreadCount} unread`}>{account.unreadCount ?? '—'}</span>}
                                    </button>
                                ))}
                        </nav>
                        <div className='grid gap-1.5'>
                            {overview?.mailboxes.filter(mailbox => mailbox.role !== 'inbox').map(mailbox => (
                                <button
                                    key={mailbox.id}
                                    data-testid={`mail-mailbox-${mailbox.role || mailbox.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                                    onClick={() => {
                                        onSelectFolder(mailbox.id)
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
                                        {!compact && <span className='truncate'>{mailbox.name}</span>}
                                    </span>
                                    {!compact && <span className='text-[10px] text-ui-muted'>{mailbox.unreadEmails || 0}</span>}
                                </button>
                            ))}
                        </div>
                    </div>
                </aside>
    )
}
