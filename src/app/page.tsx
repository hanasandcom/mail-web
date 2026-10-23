import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import MailWorkspace from '@/components/mail/mailWorkspace'
import MailAppChrome from '@/components/layout/mailAppChrome'
import { mailIdentityLoginUrl, safeMailReturnPath } from '@/utils/auth/mailReturnPath'

type SearchParams = {
    mailboxUser?: string | string[]
    returnTo?: string | string[]
    expired?: string | string[]
}

export default async function Page(props: { searchParams: Promise<SearchParams> }) {
    const cookieStore = await cookies()
    const searchParams = await props.searchParams
    const hasSession = Boolean(cookieStore.get('id')?.value
        && (cookieStore.get('mail_access_token')?.value || cookieStore.get('access_token')?.value))
    const expired = firstValue(searchParams.expired) === 'true'
    if (!hasSession || expired) {
        const mailboxUser = firstValue(searchParams.mailboxUser)
        const returnTo = safeMailReturnPath(firstValue(searchParams.returnTo)
            || (mailboxUser ? `/?mailboxUser=${encodeURIComponent(mailboxUser)}` : '/'))
        redirect(mailIdentityLoginUrl(returnTo, expired))
    }
    return <MailAppChrome><MailWorkspace mailboxUser={firstValue(searchParams.mailboxUser) || null} /></MailAppChrome>
}

function firstValue(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value
}
