import { deriveSecretKey } from '../crypto/secretBox.ts'

const mailHost = process.env.MAIL_HOST || 'mail.hanasand.com'
const mailInternalUrl = process.env.MAIL_INTERNAL_URL || process.env.MAIL_JMAP_INTERNAL_URL || 'http://127.0.0.1:8081'
const mailInternalSmtpPort = Number(process.env.MAIL_SMTP_INTERNAL_PORT || process.env.MAIL_SMTP_LOCAL_PORT || process.env.MAIL_SMTP_PORT || 587)
const mailAdminUser = process.env.MAIL_ADMIN_USERNAME || 'admin'
const mailAdminPassword = process.env.MAIL_ADMIN_PASSWORD || ''
const mailDomain = process.env.MAIL_DOMAIN || 'hanasand.com'
const serviceKeySource = process.env.MAIL_SERVICE_KEY || ''
const serviceKeySources = [
    serviceKeySource,
    process.env.MAIL_SERVICE_KEY_PREVIOUS,
    process.env.MAIL_SERVICE_KEY_LEGACY_1,
    process.env.MAIL_SERVICE_KEY_LEGACY_2,
].filter((value, index, values): value is string => typeof value === 'string' && values.indexOf(value) === index)
const systemSenderLocalPart = process.env.MAIL_SYSTEM_SENDER_LOCAL_PART || 'noreply'
const mailUserAliases = new Map(
    (process.env.MAIL_USER_ALIASES || 'eirikhanasand:eirik')
        .split(',')
        .map(entry => entry.trim())
        .filter(Boolean)
        .map(entry => {
            const [userId, mailboxUser] = entry.split(':').map(value => value.trim())
            return [userId, mailboxUser || userId]
        })
)
const systemMailboxOwner = process.env.MAIL_SYSTEM_MAILBOX_USER || 'eirikhanasand'
const systemAliasLocalParts = [...new Set([
    systemSenderLocalPart,
    ...(process.env.MAIL_SYSTEM_ALIASES || 'abuse,hostmaster,tls-reports,noreply,noreply-dmarc')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean),
])].filter(localPart => localPart.toLowerCase() !== 'postmaster')

export const mailConfig = {
    host: mailHost,
    domain: mailDomain,
    internalUrl: mailInternalUrl,
    adminUser: mailAdminUser,
    adminPassword: mailAdminPassword,
    imapPort: Number(process.env.MAIL_IMAP_PORT || 993),
    smtpPort: Number(process.env.MAIL_SMTP_PORT || 587),
    internalSmtpPort: mailInternalSmtpPort,
    managesievePort: Number(process.env.MAIL_MANAGESIEVE_PORT || 4190),
    encryptionKey: deriveSecretKey(serviceKeySource),
    decryptionKeys: serviceKeySources.map(deriveSecretKey),
    systemMailboxOwner,
    systemSenderLocalPart,
    systemAliasLocalParts,
    userAliases: mailUserAliases,
}

export function requireMailAdminConfig() {
    if (!mailConfig.adminPassword) {
        throw new Error('MAIL_ADMIN_PASSWORD is required for mail administration.')
    }

    return mailConfig
}

export function isMailAdminConfigError(error: unknown) {
    return error instanceof Error && error.message.includes('MAIL_ADMIN_PASSWORD is required')
}

export function mailAdminUnavailablePayload() {
    return {
        error: 'Mail is not available yet because mail administration is not configured on this environment.',
        code: 'MAIL_ADMIN_UNCONFIGURED',
        retryable: false,
    }
}

export function isMailServiceConnectionError(error: unknown) {
    if (!(error instanceof Error)) {
        return false
    }

    return /certificate|fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|Unable to reach mail session endpoint/i.test(error.message)
}

export function mailServiceUnavailablePayload(action: string) {
    return {
        error: `Mail is temporarily unavailable while ${action}.`,
        code: 'MAIL_SERVICE_UNAVAILABLE',
        retryable: true,
    }
}
