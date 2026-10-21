'use client'

import type { Dispatch, SetStateAction } from 'react'
import { Trash2 } from 'lucide-react'
import type { MailUiApi } from '../api'
import type { MailOverview } from '../types'
import { iconButton, toolbarButton } from './utils'

type Props = {
    overview: MailOverview
    api: MailUiApi
    draft: string
    setDraft: Dispatch<SetStateAction<string>>
    creating: boolean
    setCreating: Dispatch<SetStateAction<boolean>>
    onClose: () => void
    load: () => Promise<void>
    setError: Dispatch<SetStateAction<string>>
}

export function CreateMailboxDialog({ overview, api, draft, setDraft, creating, setCreating, onClose, load, setError }: Props) {
    return (
            <div className='fixed inset-0 z-1300 grid place-items-center bg-ui-canvas/75 p-4 backdrop-blur-sm'>
                <div className='w-full max-w-md rounded-lg border border-ui-border bg-ui-panel p-5 shadow-xl'>
                    <div className='flex items-center justify-between gap-3'>
                        <div>
                            <p className='text-[10px] tracking-normal text-ui-muted'>Mailbox</p>
                            <h3 className='mt-1 text-lg font-semibold text-ui-text'>Create folder</h3>
                        </div>
                        <button className={iconButton} onClick={() => { onClose(); setDraft('') }}>
                            <Trash2 className='h-3.5 w-3.5 rotate-45' />
                        </button>
                    </div>
                    <div className='mt-4 grid gap-3'>
                        <input
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            placeholder='Projects, Receipts, Alerts...'
                            className='rounded-lg border border-ui-border bg-ui-raised px-3 py-2.5 text-sm text-ui-text outline-none placeholder:text-ui-muted focus:border-ui-primary'
                        />
                        <div className='flex justify-end gap-2'>
                            <button className={toolbarButton} onClick={() => { onClose(); setDraft('') }}>
                                Cancel
                            </button>
                            <button
                                className='inline-flex items-center justify-center rounded-lg bg-ui-primary px-4 py-2 text-sm font-semibold text-ui-on-primary transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60'
                                disabled={!draft.trim() || creating}
                                onClick={async () => {
                                    setCreating(true)
                                    try {
                                        await api.createMailbox({ mailboxUser: overview.mailboxUser, name: draft.trim() })
                                        onClose()
                                        setDraft('')
                                        await load()
                                    } catch (cause) {
                                        setError(cause instanceof Error ? cause.message : 'Unable to create mailbox.')
                                    } finally {
                                        setCreating(false)
                                    }
                                }}
                            >
                                {creating ? 'Creating...' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
    )
}
