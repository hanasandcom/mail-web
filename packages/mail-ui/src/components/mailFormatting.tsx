import type { ReactNode } from 'react'
import { Archive, Inbox, Mail, ShieldAlert, Trash2 } from 'lucide-react'
import type { MailAddress } from '../types'

export const toolbarButton = 'inline-flex h-8 items-center gap-1.5 rounded-lg border border-ui-border bg-ui-raised px-2.5 text-[11px] font-medium text-ui-text transition hover:border-ui-primary hover:bg-ui-panel disabled:cursor-not-allowed disabled:opacity-45'
export const iconButton = 'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-ui-border bg-ui-raised text-ui-muted transition hover:border-ui-primary hover:bg-ui-panel hover:text-ui-text disabled:cursor-not-allowed disabled:opacity-45'
export const subtleInput = 'h-8 rounded-lg border border-ui-border bg-ui-raised px-3 text-xs text-ui-text outline-none transition placeholder:text-ui-muted focus:border-ui-primary focus:bg-ui-panel'

export function iconForMailbox(role?: string) {
    if (role === 'inbox') return <Inbox className='h-3.5 w-3.5 text-ui-primary' />
    if (role === 'archive') return <Archive className='h-3.5 w-3.5 text-ui-success' />
    if (role === 'junk') return <ShieldAlert className='h-3.5 w-3.5 text-ui-text' />
    if (role === 'trash') return <Trash2 className='h-3.5 w-3.5 text-ui-text' />
    return <Mail className='h-3.5 w-3.5 text-ui-muted' />
}
export function formatDate(value: string, verbose = false) {
    if (!value) {
        return 'Unknown time'
    }

    return new Intl.DateTimeFormat('en', {
        dateStyle: verbose ? 'full' : 'medium',
        timeStyle: 'short',
    }).format(new Date(value))
}

export function formatRelativeTime(value: number, now: number) {
    const diffMinutes = Math.max(1, Math.floor((now - value) / 60_000))
    if (diffMinutes < 60) {
        return `${diffMinutes}m`
    }

    const diffHours = Math.floor(diffMinutes / 60)
    if (diffHours < 24) {
        return `${diffHours}h`
    }

    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d`
}

export function formatMailboxAddress(address: MailAddress) {
    return address.name ? `${address.name} <${address.email}>` : address.email
}

export function prettyBytes(size: number) {
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function ActionIconButton({ label, icon, onClick, disabled }: { label: string, icon: ReactNode, onClick: () => void, disabled?: boolean }) {
    return (
        <button disabled={disabled} title={label} aria-label={label} className={iconButton} onClick={onClick}>
            {icon}
        </button>
    )
}
