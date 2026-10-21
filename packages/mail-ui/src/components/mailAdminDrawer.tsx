'use client'

import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { Radar, ShieldCheck, Trash2 } from 'lucide-react'
import type { MailUiApi } from '../api'
import type { MailOverview } from '../types'
import { formatDate, iconButton, subtleInput, toolbarButton } from './utils'

type Props = {
    overview: MailOverview
    api: MailUiApi
    load: () => Promise<void>
    onClose: () => void
    setError: Dispatch<SetStateAction<string>>
    creatingFilter: boolean
    setCreatingFilter: Dispatch<SetStateAction<boolean>>
    syncStatus: ReactNode
}

export function MailAdminDrawer({ overview, api, load, onClose, setError, creatingFilter, setCreatingFilter, syncStatus }: Props) {
    return (
            <div className='fixed inset-0 z-1300 flex justify-end bg-ui-canvas/70 p-3 backdrop-blur-sm' data-mail-admin-drawer>
                <aside className='flex h-full w-full max-w-xl flex-col overflow-hidden rounded-lg border border-ui-border bg-ui-panel shadow-xl'>
                    <div className='flex items-start justify-between gap-3 border-b border-ui-border p-4'>
                        <div>
                            <p className='text-[10px] tracking-normal text-ui-muted'>Mailbox admin</p>
                            <h3 className='mt-1 text-lg font-semibold text-ui-text'>{overview.mailboxAddress}</h3>
                            <p className='mt-1 text-xs text-ui-muted'>Rules, delivery health, and client settings stay here so the mail stream stays focused.</p>
                        </div>
                        <button className={iconButton} onClick={() => onClose()} aria-label='Close mailbox admin'>
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
                                            await api.createFilter({
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
                                                                await api.deleteFilter(rule.id, overview.mailboxUser)
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
                                        {syncStatus}
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
    )
}
