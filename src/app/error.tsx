'use client'

import MailErrorPage from '@/components/error/mailErrorPage'

export default function Error({ reset }: { error: Error & { digest?: string }, reset: () => void }) {
    return <MailErrorPage reset={reset} />
}
