'use client'

import MailErrorPage from '@/components/error/mailErrorPage'
import './globals.css'

export default function GlobalError({ reset }: { error: Error & { digest?: string }, reset: () => void }) {
    return (
        <html lang='en'>
            <body className='min-h-screen bg-ui-canvas text-ui-text'>
                <MailErrorPage reset={reset} />
            </body>
        </html>
    )
}
