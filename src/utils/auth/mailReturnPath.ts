const mailOrigin = 'https://mail.hanasand.com'
const identityLoginUrl = 'https://identity.hanasand.com/login'

export function safeMailReturnPath(value: string | undefined) {
    if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/'

    try {
        const url = new URL(value, mailOrigin)
        if (url.origin !== mailOrigin) return '/'
        url.searchParams.delete('expired')
        return `${url.pathname}${url.search}${url.hash}`
    } catch {
        return '/'
    }
}

export function mailIdentityLoginUrl(returnPath: string, expired: boolean) {
    const url = new URL(identityLoginUrl)
    url.searchParams.set('returnTo', new URL(returnPath, mailOrigin).toString())
    if (expired) url.searchParams.set('expired', 'true')
    return url.toString()
}
