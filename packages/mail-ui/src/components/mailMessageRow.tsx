'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Paperclip } from 'lucide-react'
import type { MailMessageSummary } from '../types'
import { formatDate } from './utils'

export type MailQuickAction = 'reply' | 'replyAll' | 'forward' | 'archive' | 'trash' | 'read' | 'unread' | 'flag' | 'unflag'

export function MessageRow({ message, active, onClick, onAction, canSend = true, archived, selectionMode, checked, onToggle, selectionDisabled }: {
    message: MailMessageSummary
    active: boolean
    onClick: () => void
    onAction: (action: MailQuickAction) => void
    canSend?: boolean
    archived: boolean
    selectionMode: boolean
    checked: boolean
    onToggle: () => void
    selectionDisabled: boolean
}) {
    const [menu, setMenu] = useState<{ x: number, y: number } | null>(null)
    const row = useRef<HTMLButtonElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (!menu) return
        menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
        const close = (event: Event) => {
            if (!menuRef.current?.contains(event.target as Node)) setMenu(null)
        }
        document.addEventListener('pointerdown', close)
        window.addEventListener('resize', close)
        window.addEventListener('scroll', close, true)
        return () => {
            document.removeEventListener('pointerdown', close)
            window.removeEventListener('resize', close)
            window.removeEventListener('scroll', close, true)
        }
    }, [menu])
    const actions: { label: string, action: MailQuickAction, disabled?: boolean }[] = [
        { label: 'Reply', action: 'reply', disabled: !canSend },
        { label: 'Reply all', action: 'replyAll', disabled: !canSend },
        { label: 'Forward', action: 'forward', disabled: !canSend },
        { label: 'Archive', action: 'archive' },
        { label: 'Delete', action: 'trash' },
        { label: message.isRead ? 'Mark unread' : 'Mark read', action: message.isRead ? 'unread' : 'read' },
        { label: message.isFlagged ? 'Unstar' : 'Star', action: message.isFlagged ? 'unflag' : 'flag' },
    ]
    const senderLine = message.from.map((from) => from.name || from.email).join(', ')

    return (<>
        <div className={`flex min-w-0 items-center rounded-lg border transition ${
            checked || active ? 'border-ui-primary bg-ui-primary/10' : 'border-transparent bg-ui-raised hover:border-ui-border hover:bg-ui-panel'
        }`}>
            {selectionMode && <label className='flex shrink-0 cursor-pointer items-center self-stretch pl-3 pr-1'>
                <input type='checkbox' aria-label={`Select ${message.subject}`} checked={checked} onChange={onToggle}
                    disabled={selectionDisabled} className='h-4 w-4 accent-ui-primary' />
            </label>}
            <button
                ref={row}
                onContextMenu={event => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY }) }}
                onKeyDown={event => {
                    if (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10') {
                        event.preventDefault()
                        const rect = event.currentTarget.getBoundingClientRect()
                        setMenu({ x: rect.left, y: rect.top })
                    }
                }}
                data-testid={`mail-message-${message.id}`}
                onClick={onClick}
                className='min-w-0 flex-1 rounded-lg px-3 py-2 text-left'
            >
                <div className='flex items-start justify-between gap-3'>
                    <div className='min-w-0 flex-1'>
                        <div className='flex min-w-0 items-center gap-2'>
                            {!message.isRead && !archived && <span aria-label='Unread message' className='h-1.5 w-1.5 shrink-0 rounded-full bg-ui-primary' />}
                            <p className='truncate text-xs font-medium text-ui-text'>{message.subject}</p>
                        </div>
                        <div className='mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-ui-muted'>
                            <span className='max-w-[40%] shrink-0 truncate'>{senderLine}</span>
                            {message.preview ? <span className='shrink-0 text-ui-muted'>•</span> : null}
                            {message.preview ? <span className='min-w-0 flex-1 truncate text-ui-muted'>{message.preview}</span> : null}
                        </div>
                    </div>
                    <div className='flex shrink-0 items-center gap-2 pt-0.5'>
                        {message.hasAttachment && <Paperclip className='h-3.5 w-3.5 text-ui-muted' />}
                        <span className='text-[10px] text-ui-muted'>{formatDate(message.receivedAt)}</span>
                    </div>
                </div>
            </button>
        </div>
        {menu && createPortal(<div ref={menuRef} role='menu' aria-label='Message actions'
            className='fixed z-1400 w-44 rounded-lg border border-ui-border bg-ui-panel p-1 shadow-xl'
            style={{ left: Math.max(8, Math.min(menu.x, window.innerWidth - 184)), top: Math.max(8, Math.min(menu.y, window.innerHeight - 280)) }}
            onKeyDown={event => {
                const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])
                const index = items.indexOf(document.activeElement as HTMLButtonElement)
                if (event.key === 'Escape' || event.key === 'Tab') {
                    setMenu(null)
                    row.current?.focus()
                } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                    event.preventDefault()
                    items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
                }
            }}>
            {actions.map(item => <button key={item.action} type='button' role='menuitem' disabled={item.disabled}
                className='block w-full rounded px-3 py-2 text-left text-xs text-ui-text hover:bg-ui-raised focus:bg-ui-raised disabled:opacity-50'
                onClick={() => { setMenu(null); row.current?.focus(); onAction(item.action) }}>{item.label}</button>)}
        </div>, document.body)}
    </>)
}
