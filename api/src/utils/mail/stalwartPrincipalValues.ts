export function aliasesForLocalParts(localParts: string[], domainId: string) {
    return Object.fromEntries([...new Set(localParts)].map((localPart, index) => [
        String(index),
        { enabled: true, name: localPart, domainId },
    ]))
}

export function passwordCredentials(secret: string) {
    return secret
        ? { '0': { '@type': 'Password', allowedIps: {}, secret } }
        : {}
}

export function addressesToLocalParts(emails: string[]) {
    return emails
        .map(email => email.split('@')[0]?.trim())
        .filter((value): value is string => Boolean(value))
}

export function toStringArray(value: unknown) {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function toRecord(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
