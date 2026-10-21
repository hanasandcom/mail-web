import type { MailboxRecord } from './jmapTypes.ts'
import { getMailSession, jmapCall } from './jmapSession.ts'

export async function getMailboxList(username: string, password: string) {
    const { session, accountId } = await getMailSession(username, password)
    const result = await jmapCall<{ list?: MailboxRecord[] }>(username, password, session, [
        ['Mailbox/get', { accountId, properties: ['id', 'name', 'role', 'parentId', 'sortOrder', 'totalEmails', 'unreadEmails', 'myRights'] }, 'mailboxes']
    ])

    return { accountId, session, mailboxes: (result.list || []).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name)) }
}

export async function createMailbox(username: string, password: string, name: string, parentId?: string | null) {
    const { session, accountId } = await getMailSession(username, password)
    const createId = `mailbox-${Date.now()}`
    await jmapCall(username, password, session, [
        ['Mailbox/set', { accountId, create: { [createId]: { name, parentId: parentId || null } } }, 'create-mailbox']
    ])
}

export async function ensureMailbox(username: string, password: string, name: string, role?: string) {
    const { mailboxes } = await getMailboxList(username, password)
    const existing = mailboxes.find(mailbox => mailbox.name.toLowerCase() === name.toLowerCase() || (role && mailbox.role === role))
    if (existing) return existing.id

    await createMailbox(username, password, name)
    const refreshed = await getMailboxList(username, password)
    return refreshed.mailboxes.find(mailbox => mailbox.name.toLowerCase() === name.toLowerCase())?.id || null
}
