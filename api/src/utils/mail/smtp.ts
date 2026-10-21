import nodemailer from 'nodemailer'
import { mailConfig } from './config.ts'
import type { MailAddress } from './types.ts'

type SmtpAttachment = {
    name: string
    type: string
    contentBase64: string
}

export async function sendMailViaSmtp(params: {
    username: string
    password: string
    from: MailAddress
    to: MailAddress[]
    cc?: MailAddress[]
    bcc?: MailAddress[]
    replyTo?: MailAddress[]
    subject: string
    textBody: string
    htmlBody?: string
    attachments?: SmtpAttachment[]
}) {
    const smtpHost = getInternalSmtpHost()
    const requireTls = shouldRequireTls()
    const transport = nodemailer.createTransport({
        host: smtpHost,
        // Port 25 is incoming mail, not authenticated submission.
        port: mailConfig.internalSmtpPort === 25 ? 587 : mailConfig.internalSmtpPort,
        secure: mailConfig.internalSmtpPort === 465,
        name: mailConfig.host,
        authMethod: 'LOGIN',
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 30000,
        requireTLS: requireTls,
        ignoreTLS: !requireTls,
        auth: {
            user: params.username,
            pass: params.password,
        },
        tls: {
            servername: mailConfig.host,
        },
    })

    return await transport.sendMail({
        from: formatAddress(params.from),
        to: params.to.map(formatAddress),
        cc: (params.cc || []).map(formatAddress),
        bcc: (params.bcc || []).map(formatAddress),
        replyTo: (params.replyTo || []).map(formatAddress),
        subject: params.subject,
        text: params.textBody,
        html: params.htmlBody,
        attachments: (params.attachments || []).map(attachment => ({
            filename: attachment.name,
            contentType: attachment.type,
            content: Buffer.from(attachment.contentBase64, 'base64'),
        })),
    })
}

function formatAddress(address: MailAddress) {
    return address.name ? `${address.name} <${address.email}>` : address.email
}

function getInternalSmtpHost() {
    try {
        return new URL(mailConfig.internalUrl).hostname || mailConfig.host
    } catch {
        return mailConfig.host
    }
}

function shouldRequireTls() {
    const configured = process.env.MAIL_SMTP_REQUIRE_TLS
    if (configured !== undefined) {
        return configured === '1' || configured.toLowerCase() === 'true'
    }

    return true
}
