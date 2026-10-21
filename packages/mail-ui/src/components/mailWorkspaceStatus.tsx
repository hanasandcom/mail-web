import type { MailMessageSummary } from '../types'

export type MailListFilter = 'all' | 'unread' | 'starred' | 'attachments'
export const MAIL_STALE_AFTER_MS = 60_000

export function MailSyncStatus({
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
    if (!unreachableSince || now - unreachableSince < MAIL_STALE_AFTER_MS) return null
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

export function buildMailListFilters(messages: MailMessageSummary[]): Array<{ id: MailListFilter, label: string, count: number }> {
    return [
        { id: 'all', label: 'All', count: messages.length },
        { id: 'unread', label: 'Unread', count: messages.filter(message => !message.isRead).length },
        { id: 'starred', label: 'Starred', count: messages.filter(message => message.isFlagged).length },
        { id: 'attachments', label: 'Attachments', count: messages.filter(message => message.hasAttachment).length },
    ]
}

export function messageMatchesMailFilter(message: MailMessageSummary, filter: MailListFilter) {
    if (filter === 'unread') return !message.isRead
    if (filter === 'starred') return message.isFlagged
    if (filter === 'attachments') return message.hasAttachment
    return true
}
