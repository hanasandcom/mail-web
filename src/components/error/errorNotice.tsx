import { AlertCircle, CheckCircle2, Info } from 'lucide-react'

type ErrorNoticeProps = {
    message: string | boolean | null | undefined
    title?: string
    variant?: 'error' | 'info' | 'success'
    compact?: boolean
    className?: string
    actionLabel?: string
    onAction?: () => void
    secondaryActionLabel?: string
    onSecondaryAction?: () => void
}

const variants = {
    error: {
        icon: AlertCircle,
        iconTone: 'text-ui-muted',
        shell: 'border-ui-border bg-ui-panel text-ui-text',
        title: 'text-ui-text',
        body: 'text-ui-text',
        button: 'border-ui-danger bg-ui-raised text-ui-text hover:bg-ui-panel',
        secondary: 'text-ui-text hover:bg-ui-raised',
    },
    info: {
        icon: Info,
        iconTone: 'text-ui-primary',
        shell: 'border-ui-primary bg-ui-panel text-ui-text',
        title: 'text-ui-primary',
        body: 'text-ui-text',
        button: 'border-ui-primary bg-ui-raised text-ui-primary hover:bg-ui-panel',
        secondary: 'text-ui-primary hover:bg-ui-raised',
    },
    success: {
        icon: CheckCircle2,
        iconTone: 'text-ui-success',
        shell: 'border-ui-success bg-ui-panel text-ui-success',
        title: 'text-ui-success',
        body: 'text-ui-success',
        button: 'border-ui-success bg-ui-raised text-ui-success hover:bg-ui-panel',
        secondary: 'text-ui-success hover:bg-ui-raised',
    },
}

export default function ErrorNotice({
    message,
    title,
    variant = 'error',
    compact = false,
    className = '',
    actionLabel,
    onAction,
    secondaryActionLabel,
    onSecondaryAction,
}: ErrorNoticeProps) {
    if (!message || typeof message === 'boolean') {
        return null
    }

    const tone = variants[variant]
    const Icon = tone.icon

    return (
        <div className={`rounded-lg border shadow-sm ${tone.shell} ${compact ? 'px-3 py-2' : 'px-3.5 py-3'} ${className}`}>
            <div className='flex min-w-0 items-start gap-2.5'>
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone.iconTone}`} />
                <div className='min-w-0 flex-1'>
                    {title ? <p className={`text-xs font-semibold ${tone.title}`}>{title}</p> : null}
                    <p className={`${compact ? 'text-xs' : 'text-sm'} font-normal leading-5 ${tone.body}`}>{message}</p>
                    {(actionLabel && onAction) || (secondaryActionLabel && onSecondaryAction) ? (
                        <div className='mt-2 flex flex-wrap gap-2'>
                            {actionLabel && onAction ? (
                                <button
                                    type='button'
                                    onClick={onAction}
                                    className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-primary ${tone.button}`}
                                >
                                    {actionLabel}
                                </button>
                            ) : null}
                            {secondaryActionLabel && onSecondaryAction ? (
                                <button
                                    type='button'
                                    onClick={onSecondaryAction}
                                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-primary ${tone.secondary}`}
                                >
                                    {secondaryActionLabel}
                                </button>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    )
}
