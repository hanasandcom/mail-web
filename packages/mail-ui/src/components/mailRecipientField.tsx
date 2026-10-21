'use client'

import type { RecentMailRecipient } from '../types'
import { formatRelativeTime, subtleInput } from './utils'

export function RecipientField({
    value,
    now,
    onChange,
    onFocus,
    onBlur,
    suggestions,
    placeholder,
    testId,
}: {
    value: string
    now: number
    onChange: (value: string) => void
    onFocus: () => void
    onBlur: () => void
    suggestions: RecentMailRecipient[]
    placeholder: string
    testId?: string
}) {
    const currentToken = value.split(',').at(-1)?.trim().toLowerCase() || ''
    const visibleSuggestions = suggestions
        .filter((recipient) => {
            if (!currentToken) {
                return true
            }

            const label = `${recipient.name || ''} ${recipient.email}`.toLowerCase()
            return label.includes(currentToken)
        })
        .slice(0, 6)

    function applySuggestion(recipient: RecentMailRecipient) {
        const parts = value.split(',').map((part) => part.trim()).filter(Boolean)
        const label = recipient.name ? `${recipient.name} <${recipient.email}>` : recipient.email

        if (value.includes(',')) {
            parts[parts.length - 1] = label
            onChange(`${parts.join(', ')}${parts.length ? ', ' : ''}`)
            return
        }

        onChange(label)
    }

    return (
        <div className='relative'>
            <input
                data-testid={testId}
                className={`${subtleInput} w-full text-ui-text`}
                placeholder={placeholder}
                value={value}
                onFocus={onFocus}
                onBlur={onBlur}
                onChange={(event) => onChange(event.target.value)}
            />
            {!!visibleSuggestions.length && (
                <div className='absolute left-0 right-0 top-[calc(100%+0.35rem)] z-10 rounded-lg border border-ui-border bg-ui-panel p-1 shadow-xl backdrop-blur-xl'>
                    {visibleSuggestions.map((recipient) => (
                        <button
                            key={recipient.email}
                            type='button'
                            data-testid={`mail-recipient-suggestion-${recipient.email.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                            className='flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition hover:bg-ui-raised'
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => applySuggestion(recipient)}
                        >
                            <div className='min-w-0'>
                                <p className='truncate text-xs text-ui-text'>{recipient.name || recipient.email}</p>
                                {recipient.name && <p className='truncate text-[10px] text-ui-muted'>{recipient.email}</p>}
                            </div>
                            <span className='shrink-0 text-[10px] text-ui-muted'>
                                {formatRelativeTime(new Date(recipient.lastUsedAt).getTime(), now)}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
