'use client'

import { Check, ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

export type MailSelectOption = { id: string; label: string; description?: string }

export function MailSelect({
    id,
    label,
    value,
    options,
    onChange,
    className = '',
    compact = false,
}: {
    id?: string
    label: string
    value: string
    options: MailSelectOption[]
    onChange: (value: string) => void
    className?: string
    compact?: boolean
}) {
    const generatedId = useId().replace(/:/g, '')
    const listboxId = `${id || `mail-select-${generatedId}`}-options`
    const rootRef = useRef<HTMLDivElement>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const typeaheadRef = useRef('')
    const typeaheadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [open, setOpen] = useState(false)
    const [menuOffset, setMenuOffset] = useState(0)
    const [activeIndex, setActiveIndex] = useState(Math.max(0, options.findIndex(option => option.id === value)))
    const selectedOption = options.find(option => option.id === value)
    const activeOption = options[activeIndex]

    const alignMenuToViewport = useCallback(() => {
        const trigger = triggerRef.current
        if (!trigger) return
        const bounds = trigger.getBoundingClientRect()
        const menuWidth = Math.max(bounds.width, Math.min(288, window.innerWidth - 24))
        const left = Math.max(12, Math.min(bounds.left, window.innerWidth - 12 - menuWidth))
        setMenuOffset(left - bounds.left)
    }, [])

    const showMenu = () => {
        alignMenuToViewport()
        setOpen(true)
    }

    useEffect(() => {
        if (!open) return
        window.addEventListener('resize', alignMenuToViewport)
        const closeOnOutsidePointer = (event: PointerEvent) => {
            if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
        }
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            setOpen(false)
            triggerRef.current?.focus()
        }
        document.addEventListener('pointerdown', closeOnOutsidePointer)
        document.addEventListener('keydown', closeOnEscape)
        return () => {
            document.removeEventListener('pointerdown', closeOnOutsidePointer)
            document.removeEventListener('keydown', closeOnEscape)
            window.removeEventListener('resize', alignMenuToViewport)
        }
    }, [alignMenuToViewport, open])

    useEffect(() => {
        if (open) setActiveIndex(Math.max(0, options.findIndex(option => option.id === value)))
    }, [open, options, value])

    useEffect(() => {
        if (open) document.getElementById(`${listboxId}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' })
    }, [activeIndex, listboxId, open])

    const selectActiveOption = () => {
        if (!activeOption) return
        onChange(activeOption.id)
        setOpen(false)
    }

    const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault()
            if (!options.length) return
            if (!open) showMenu()
            else setActiveIndex(index => Math.min(index + 1, options.length - 1))
        } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            if (!options.length) return
            if (!open) showMenu()
            else setActiveIndex(index => Math.max(index - 1, 0))
        } else if (event.key === 'Home' && open) {
            event.preventDefault()
            setActiveIndex(0)
        } else if (event.key === 'End' && open) {
            event.preventDefault()
            setActiveIndex(options.length - 1)
        } else if ((event.key === 'Enter' || event.key === ' ') && open) {
            event.preventDefault()
            selectActiveOption()
        } else if ((event.key === 'Enter' || event.key === ' ') && !open) {
            event.preventDefault()
            setActiveIndex(Math.max(0, options.findIndex(option => option.id === value)))
            showMenu()
        } else if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
            const query = `${typeaheadRef.current}${event.key}`.toLocaleLowerCase()
            typeaheadRef.current = query
            if (typeaheadTimerRef.current) clearTimeout(typeaheadTimerRef.current)
            typeaheadTimerRef.current = setTimeout(() => { typeaheadRef.current = '' }, 700)
            const start = open ? activeIndex + 1 : 0
            const match = options.findIndex((option, index) => index >= start && option.label.toLocaleLowerCase().startsWith(query))
            const wrappedMatch = match === -1 ? options.findIndex(option => option.label.toLocaleLowerCase().startsWith(query)) : match
            if (wrappedMatch !== -1) {
                setActiveIndex(wrappedMatch)
                showMenu()
            }
        }
    }

    return <div ref={rootRef} className={`relative min-w-0 ${className}`}>
        <button
            type='button'
            ref={triggerRef}
            id={id}
            role='combobox'
            aria-label={label}
            aria-expanded={open}
            aria-haspopup='listbox'
            aria-controls={listboxId}
            aria-activedescendant={open && activeOption ? `${listboxId}-${activeIndex}` : undefined}
            aria-autocomplete='none'
            tabIndex={0}
            onClick={() => {
                if (!open) {
                    setActiveIndex(Math.max(0, options.findIndex(option => option.id === value)))
                    showMenu()
                } else setOpen(false)
            }}
            onKeyDown={handleKeyDown}
            onBlur={event => {
                if (!rootRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false)
            }}
            className={`group flex w-full min-w-0 cursor-pointer select-none items-center gap-1.5 rounded-xl border px-1.5 py-1.5 text-left text-ui-text outline-none transition-[border-color,background-color,box-shadow,transform] duration-200 focus-visible:border-ui-primary focus-visible:ring-2 focus-visible:ring-ui-primary/20 active:scale-[.99] disabled:cursor-not-allowed ${open ? 'border-ui-primary/35 bg-ui-raised shadow-lg shadow-black/10 ring-1 ring-ui-primary/10' : 'border-ui-border/70 bg-ui-raised/70 shadow-sm shadow-ui-canvas/10 hover:border-ui-border hover:bg-ui-raised'} ${compact ? 'h-11 text-xs' : 'h-11 text-sm'}`}
        >
            <span className='min-w-0 flex-1 truncate text-left font-medium tracking-[-0.01em]'>{selectedOption?.label ?? ''}</span>
            <span aria-hidden='true' className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-ui-muted transition-[background-color,color,transform] duration-200 ${open ? 'bg-ui-primary/10 text-ui-primary' : 'group-hover:text-ui-text'}`}>
                <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} strokeWidth={1.8} />
            </span>
        </button>
        {open ? <div
            id={listboxId}
            role='listbox'
            aria-label={label}
            style={{ left: menuOffset, right: 'auto' }}
            className='absolute top-[calc(100%+0.45rem)] z-[70] max-h-72 w-[min(18rem,calc(100vw-1.5rem))] min-w-full max-w-[calc(100vw-1.5rem)] overflow-y-auto overscroll-contain rounded-xl border border-ui-border bg-ui-raised p-1.5 text-ui-text shadow-xl shadow-black/20'
        >
            {options.map((option, index) => {
                const selected = option.id === value
                const active = index === activeIndex
                return <div
                    key={option.id}
                    id={`${listboxId}-${index}`}
                    role='option'
                    aria-selected={selected}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => {
                        onChange(option.id)
                        setOpen(false)
                        triggerRef.current?.focus()
                    }}
                    className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1.5 text-sm transition-[background-color,box-shadow,color] ${selected ? 'bg-ui-primary/10 font-semibold text-ui-text ring-1 ring-inset ring-ui-primary/15' : active ? 'bg-ui-panel text-ui-text' : 'text-ui-muted hover:bg-ui-panel hover:text-ui-text'}`}
                >
                    <span className='grid min-w-0 flex-1 gap-0.5'>
                        <span className='truncate'>{option.label}</span>
                        {option.description ? <span className='truncate text-xs font-normal text-ui-muted'>{option.description}</span> : null}
                    </span>
                    {selected ? <Check aria-hidden='true' className='h-4 w-4 shrink-0 text-ui-primary' strokeWidth={2} /> : null}
                </div>
            })}
        </div> : null}
    </div>
}
