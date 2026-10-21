'use client'

import { useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { MailUiApi } from '../api'
import type { MailMessageSummary, MailOverview } from '../types'
import type { MailQuickAction } from './mailMessageRow'
import type { LoadMail } from './useMailWorkspaceOverview'
import { composeFromReply, runAction, type ComposerState } from './utils'

type Action = 'archive' | 'trash' | 'read' | 'unread' | 'flag' | 'unflag' | 'junk' | 'ham' | 'restore'

export function useMailWorkspaceActions({
    api, overview, loading, load, setError, setSearchRefresh, setOverview, selection, archivingRef, onCompose,
    selectionMode, setSelectionMode, checkedMessages, setCheckedMessages, requestVersion,
}: {
    api: MailUiApi
    overview: MailOverview | null
    loading: boolean
    load: LoadMail
    setError: Dispatch<SetStateAction<string>>
    setSearchRefresh: Dispatch<SetStateAction<number>>
    setOverview: Dispatch<SetStateAction<MailOverview | null>>
    selection: { current: { user: string | null, mailbox: string | null, message: string | null } }
    archivingRef: { current: boolean }
    onCompose: (state: ComposerState) => void
    selectionMode: boolean
    setSelectionMode: Dispatch<SetStateAction<boolean>>
    checkedMessages: Set<string>
    setCheckedMessages: Dispatch<SetStateAction<Set<string>>>
    requestVersion: { current: number }
}) {
    const [archiving, setArchiving] = useState(false)

    async function performAction(messageId: string, action: Action) {
        if (!overview) return
        if (await runAction(api, messageId, overview, setError, load, action)) setSearchRefresh(value => value + 1)
    }

    async function quickAction(message: MailMessageSummary, action: MailQuickAction) {
        if (!overview || loading || archivingRef.current) return
        if (action === 'reply' || action === 'replyAll' || action === 'forward') {
            try {
                const version = requestVersion.current
                const detail = await api.fetchMailOverview({ mailboxUser: overview.mailboxUser, mailboxId: overview.selectedMailboxId, messageId: message.id })
                if (version !== requestVersion.current) return
                if (!detail.selectedMessage) throw new Error('This message is no longer available.')
                onCompose(composeFromReply(action, detail.selectedMessage, overview.mailboxAddress))
            } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to open message.') }
        } else await performAction(message.id, action)
    }

    async function archiveSelected(messages: MailMessageSummary[]) {
        if (!overview || archivingRef.current || !messages.length) return
        const user = overview.mailboxUser
        const mailbox = overview.selectedMailboxId
        const ids = messages.map(message => message.id)
        const succeeded = new Set<string>()
        archivingRef.current = true
        setArchiving(true)
        setError('')
        try {
            for (const id of ids) {
                try { await api.messageAction(id, { mailboxUser: user, action: 'archive' }); succeeded.add(id) }
                catch { /* Keep failed messages selected so they can be retried. */ }
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

    return { selectionMode, setSelectionMode, checkedMessages, setCheckedMessages, archiving, quickAction, performAction, archiveSelected }
}
