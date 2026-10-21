import type { MailAddress } from './types.ts'
import { mailConfig } from './config.ts'

export function mailboxLocalPartForUser(userId: string) {
    return mailConfig.userAliases.get(userId) || userId
}

export function addressForUser(userId: string) {
    return `${mailboxLocalPartForUser(userId)}@${mailConfig.domain}`
}

export function addressesForUser(userId: string) {
    const addresses = new Set<string>([addressForUser(userId)])
    if (userId === mailConfig.systemMailboxOwner) {
        for (const localPart of mailConfig.systemAliasLocalParts) {
            addresses.add(`${localPart}@${mailConfig.domain}`)
        }
    }

    return [...addresses]
}

export function formatAddressList(addresses: MailAddress[]) {
    return addresses.map(address => address.name ? `${address.name} <${address.email}>` : address.email).join(', ')
}

export function parseAddressInput(value: string) {
    return value
        .split(',')
        .map(part => part.trim())
        .filter(Boolean)
        .map(parseSingleAddress)
}

function parseSingleAddress(value: string): MailAddress {
    const match = value.match(/^(.*)<([^>]+)>$/)
    if (match) {
        return {
            name: match[1].trim().replace(/^"|"$/g, ''),
            email: match[2].trim(),
        }
    }

    return { email: value.trim() }
}

export function normalizeMessageText(value: string) {
    return value
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+\n/g, '\n')
        .trim()
}

export function stripHtml(value: string) {
    return value
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&#39;/gi, '\'')
        .replace(/&quot;/gi, '"')
}

export function toSafeFilename(value: string) {
    return value.replace(/[^a-zA-Z0-9._-]+/g, '-')
}
