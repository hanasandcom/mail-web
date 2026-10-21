'use client'

type MailErrorPageProps = {
    reset: () => void
}

export default function MailErrorPage({ reset }: MailErrorPageProps) {
    return (
        <main className='grid min-h-[60vh] content-center justify-items-start gap-4 px-4 py-12 text-ui-text sm:px-8'>
            <h1 className='text-2xl font-semibold'>Mail could not be loaded.</h1>
            <p className='max-w-xl text-sm leading-6 text-ui-muted'>Something went wrong while loading mail. Try again.</p>
            <button
                type='button'
                onClick={reset}
                className='inline-flex h-10 items-center rounded-lg border border-ui-border bg-ui-panel px-4 text-sm font-semibold text-ui-text transition hover:bg-ui-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-primary'
            >
                Try again
            </button>
        </main>
    )
}
