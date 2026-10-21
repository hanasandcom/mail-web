export { getMailSession, jmapCall } from './jmapSession.ts'
export { getMailboxList, createMailbox, ensureMailbox } from './jmapMailbox.ts'
export { listMessages, listMessagePage, searchMessagePage, getMessage, moveMessage, patchMessageKeywords, listInboxMessagesForFiltering } from './jmapMessages.ts'
export { uploadAttachment, downloadBlob, downloadBlobWithSession } from './jmapAttachments.ts'
export { storeSentMessage } from './jmapSent.ts'

export async function getSieveScript(username: string, password: string) {
    void username
    void password
    return null
}
