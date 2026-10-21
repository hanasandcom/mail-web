export function getCookie(name: string): string | null {
    const matches = document.cookie.match(new RegExp(
        '(?:^|; )' + name.replace(/([.$?*|{}()[\]/\\+^])/g, '\\$1') + '=([^;]*)'
    ))
    return matches ? decodeURIComponent(matches[1]) : null
}

export function setCookie(name: string, value: string, days?: number) {
    let expires = ''

    if (days) {
        const date = new Date()
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000))
        expires = `expires=${date.toUTCString()};`
    }

    document.cookie = `${name}=${encodeURIComponent(value)}; ${expires} path=/; SameSite=Lax`
    removeSharedDomainCookie(name)
}

export function setCookieWithExpiresAt(name: string, value: string, expiresAt?: string | null) {
    const expires = expiresAt ? `expires=${new Date(expiresAt).toUTCString()};` : ''
    document.cookie = `${name}=${encodeURIComponent(value)}; ${expires} path=/; SameSite=Lax`
    removeSharedDomainCookie(name)
}

export function removeCookies(...cookies: string[]) {
    for (const cookie of cookies) removeCookie(cookie)
}

export function removeCookie(name: string) {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax`
    const domain = sharedCookieDomain()
    if (domain) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax${domain}`
}

function sharedCookieDomain() {
    if (typeof window === 'undefined') return ''
    const hostname = window.location.hostname
    return hostname === 'hanasand.com' || hostname.endsWith('.hanasand.com')
        ? '; domain=.hanasand.com'
        : ''
}

function removeSharedDomainCookie(name: string) {
    if (typeof window === 'undefined') return
    const hostname = window.location.hostname
    if (hostname === 'hanasand.com' || hostname.endsWith('.hanasand.com')) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.hanasand.com; SameSite=Lax; Secure`
    }
}
