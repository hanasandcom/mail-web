import { cookies } from 'next/headers'
import MailWorkspace from '@/components/mail/mailWorkspace'
import MailAppChrome from '@/components/layout/mailAppChrome'
import MailSignIn from '@/components/auth/mailSignIn'
import { safeMailReturnPath } from '@/components/auth/returnPath'

type SearchParams = {
    mailboxUser?: string | string[]
    returnTo?: string | string[]
    error?: string | string[]
}

export default async function Page(props: { searchParams: Promise<SearchParams> }) {
    const cookieStore = await cookies()
    const searchParams = await props.searchParams
    const hasSession = Boolean(cookieStore.get('id')?.value
        && (cookieStore.get('mail_access_token')?.value || cookieStore.get('access_token')?.value))
    if (!hasSession) {
        const mailboxUser = firstValue(searchParams.mailboxUser)
        const returnTo = safeMailReturnPath(firstValue(searchParams.returnTo)
            || (mailboxUser ? `/?mailboxUser=${encodeURIComponent(mailboxUser)}` : '/'))
        return <MailSignIn returnTo={returnTo} initialError={firstValue(searchParams.error)} />
    }
    return <MailAppChrome><MailWorkspace mailboxUser={firstValue(searchParams.mailboxUser) || null} /></MailAppChrome>
}

function firstValue(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value
}
