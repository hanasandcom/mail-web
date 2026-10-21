export function safeMailReturnPath(value: string | undefined) {
    if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/'

    try {
        const url = new URL(value, 'https://mail.hanasand.com')
        if (url.origin !== 'https://mail.hanasand.com') return '/'
        return `${url.pathname}${url.search}${url.hash}`
    } catch {
        return '/'
    }
}
