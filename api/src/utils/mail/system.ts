import crypto from 'node:crypto'
import type { MailAddress } from './types.ts'
import { mailConfig } from './config.ts'
import { storeSentMessage } from './jmap.ts'
import { sendMailViaSmtp } from './smtp.ts'
import { type AdminPatch, createPrincipal, findPrincipalByName, patchPrincipal } from './stalwartAdmin.ts'

export async function sendSystemMail(params: {
    to: string
    subject: string
    textBody: string
    htmlBody?: string
    senderName?: string
    replyTo?: MailAddress[]
}) {
    const access = await ensureSystemSender()

    const result = await sendMailViaSmtp({
        username: access.username,
        password: access.password,
        from: { email: access.address, name: params.senderName || 'Hanasand' },
        to: [{ email: params.to }],
        replyTo: params.replyTo,
        subject: params.subject,
        textBody: params.textBody,
        htmlBody: params.htmlBody,
    })
    await storeSentMessage({ ...access, from: { email: access.address, name: params.senderName || 'Hanasand' }, to: [{ email: params.to }], subject: params.subject, textBody: params.textBody, htmlBody: params.htmlBody }).catch(() => {
        console.warn('System email sent, but its Sent copy could not be saved.')
    })
    console.info('System email accepted by mail server', { messageId: result.messageId, acceptedCount: result.accepted.length })
    return result
}

export async function ensureSystemSender() {
    const { username, address, password } = systemSenderAccess()

    // Provisioning needs mail-admin access; sending from an existing account does not.
    if (!mailConfig.adminPassword) {
        return { username, address, password }
    }

    const principal = await findPrincipalByName(username, 'individual')

    if (!principal) {
        await createPrincipal({
            type: 'individual',
            quota: 0,
            name: username,
            description: 'Reserved Hanasand system sender',
            secrets: [password],
            emails: [address],
            urls: [],
            memberOf: [],
            roles: ['user'],
            lists: [],
            members: [],
            enabledPermissions: [],
            disabledPermissions: [],
            externalMembers: [],
        })
    } else {
        const patches: AdminPatch[] = [
            { action: 'set', field: 'description', value: 'Reserved Hanasand system sender' },
            { action: 'set', field: 'secrets', value: [password] },
        ]

        if (!principal.emails?.includes(address)) {
            patches.push({ action: 'addItem', field: 'emails', value: address })
        }

        await patchPrincipal(principal.name, patches)
    }

    return { username, address, password }
}

export function systemSenderAccess() {
    const username = mailConfig.systemSenderLocalPart
    const address = `${username}@${mailConfig.domain}`
    const password = process.env.MAIL_SYSTEM_SENDER_PASSWORD || crypto
        .createHash('sha256')
        .update(mailConfig.encryptionKey)
        .update(`system-sender:${address}`)
        .digest('base64url')

    return { username, address, password }
}
