export function resolveMailProxyAuth(headers: Headers, cookieToken: string, cookieId: string) {
    const authorization = headers.get('authorization')
    const headerToken = authorization?.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length).trim()
        : ''

    return {
        token: headerToken || cookieToken,
        id: headers.get('id') || cookieId,
    }
}
