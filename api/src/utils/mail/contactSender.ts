import run from '#db'
import { mailConfig } from './config.ts'
import type { MailAddress } from './types.ts'

export function isExternalContactAddress(email: string) {
    if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(email)) return false
    const domain = email.split('@')[1].toLowerCase()
    const ownDomain = mailConfig.domain.toLowerCase()
    return domain !== ownDomain && !domain.endsWith(`.${ownDomain}`)
}

type ContactMessage = {
    subject?: string
    from?: MailAddress[]
    replyTo?: MailAddress[]
    textBody?: Array<{ partId?: string }>
    bodyValues?: Record<string, { value?: string }>
}

type Contact = { ticket_id: string, name: string, email: string, subject: string }

export function applyContactSender(message: ContactMessage, contact: Contact) {
    const text = message.textBody?.map(part => message.bodyValues?.[part.partId || '']?.value || '').join('\n').replace(/\r\n/g, '\n') || ''
    // Attribute only our persisted contact notifications, never arbitrary Reply-To
    // headers or addresses extracted from an untrusted message body.
    if (message.subject !== `[${contact.ticket_id}] ${contact.subject}`
        || message.from?.length !== 1
        || message.from[0].email.toLowerCase() !== `${mailConfig.systemSenderLocalPart}@${mailConfig.domain}`.toLowerCase()
        || !text.startsWith(`Ticket: ${contact.ticket_id}\nName: ${contact.name}\nEmail: ${contact.email}\n`)
        || !isExternalContactAddress(contact.email)) return
    const sender = { email: contact.email, name: `${contact.name} (via contact form; unverified)` }
    message.from = [sender]
    message.replyTo = [{ email: contact.email, name: contact.name }]
}

export async function attributeContactSenders(messages: ContactMessage[]) {
    const tickets = messages.flatMap(message => {
        const match = message.subject?.match(/^\[(HS-\d{8}-[A-F0-9]{8})\] /)
        return match && message.from?.some(address => address.email.toLowerCase() === `${mailConfig.systemSenderLocalPart}@${mailConfig.domain}`.toLowerCase()) ? [match[1]] : []
    })
    if (!tickets.length) return
    const result = await run('SELECT ticket_id, name, email, subject FROM commercial_contact_requests WHERE ticket_id = ANY($1::text[])', [tickets])
    const contacts = new Map<string, Contact>(result.rows.map((row: Contact) => [row.ticket_id, row]))
    for (const message of messages) {
        const ticket = message.subject?.match(/^\[(HS-\d{8}-[A-F0-9]{8})\] /)?.[1]
        const contact = ticket ? contacts.get(ticket) : undefined
        if (contact) applyContactSender(message, contact)
    }
}
