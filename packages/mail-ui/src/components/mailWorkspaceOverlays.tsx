'use client'

import { useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { MailUiApi } from '../api'
import type { MailOverview } from '../types'
import { Composer } from './mailComposer'
import { MailAdminDrawer } from './mailAdminDrawer'
import { CreateMailboxDialog } from './createMailboxDialog'
import { emptyComposer, type ComposerState } from './utils'
import type { LoadMail } from './useMailWorkspaceOverview'
import { MailSyncStatus } from './mailWorkspaceStatus'

export function MailWorkspaceOverlays({ api, overview, now, selectedMailboxId, composer, setComposer, load, setError, lastSuccessAt, unreachableSince, adminOpen, setAdminOpen, mailboxOpen, setMailboxOpen, creatingMailbox, setCreatingMailbox, sendIdempotencyKey }: {
    api: MailUiApi
    overview: MailOverview | null
    now: number
    selectedMailboxId: string | null
    composer: ComposerState
    setComposer: Dispatch<SetStateAction<ComposerState>>
    load: LoadMail
    setError: Dispatch<SetStateAction<string>>
    lastSuccessAt: number | null
    unreachableSince: number | null
    adminOpen: boolean
    setAdminOpen: (open: boolean) => void
    mailboxOpen: boolean
    setMailboxOpen: (open: boolean) => void
    creatingMailbox: boolean
    setCreatingMailbox: Dispatch<SetStateAction<boolean>>
    sendIdempotencyKey: MutableRefObject<string | null>
}) {
    const [creatingFilter, setCreatingFilter] = useState(false)
    const [mailboxDraft, setMailboxDraft] = useState('')

    return <>
        {composer.open && overview && <Composer state={composer} now={now} mailboxAddress={overview.mailboxAddress} recentRecipients={overview.recentRecipients} onChange={setComposer} onClose={() => { sendIdempotencyKey.current = null; setComposer(emptyComposer) }} onSubmit={async next => {
            try {
                sendIdempotencyKey.current ||= crypto.randomUUID()
                const result = await api.sendMail({ mailboxUser: overview.mailboxUser, to: next.to, cc: next.cc, bcc: next.bcc, subject: next.subject, textBody: next.body, attachments: next.attachments }, sendIdempotencyKey.current)
                sendIdempotencyKey.current = null
                setComposer(emptyComposer)
                await load({ silent: true, mailboxUser: result?.mailboxUser || overview.mailboxUser, mailboxId: result?.sentMailboxId || selectedMailboxId, messageId: result?.sentMessageId || null })
            } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to send mail.') }
        }} />}
        {adminOpen && overview && <MailAdminDrawer overview={overview} api={api} load={() => load()} onClose={() => setAdminOpen(false)} setError={setError} creatingFilter={creatingFilter} setCreatingFilter={setCreatingFilter} syncStatus={<MailSyncStatus lastSuccessAt={lastSuccessAt} unreachableSince={unreachableSince} now={now} full />} />}
        {mailboxOpen && overview && <CreateMailboxDialog overview={overview} api={api} draft={mailboxDraft} setDraft={setMailboxDraft} creating={creatingMailbox} setCreating={setCreatingMailbox} onClose={() => { setMailboxOpen(false); setMailboxDraft('') }} load={() => load()} setError={setError} />}
    </>
}
