import type { FastifyInstance } from 'fastify'
import getMailOverview from './handlers/mail/getOverview.ts'
import getMailSearch from './handlers/mail/getSearch.ts'
import postSendMail from './handlers/mail/postSend.ts'
import postMailAction from './handlers/mail/postAction.ts'
import postMailbox from './handlers/mail/postMailbox.ts'
import postMailFilter from './handlers/mail/postFilter.ts'
import deleteMailFilter from './handlers/mail/deleteFilter.ts'
import getMailBlob from './handlers/mail/getBlob.ts'
import getMailMessageReputation from './handlers/mail/getMessageReputation.ts'
import { getSupportInbox, postSupportMail } from './handlers/internal/supportMail.ts'
import { getPasskeyOptions, getSsoStart, postIdentityLogin, postPasskeyVerify } from './handlers/auth.ts'

export async function registerMailRoutes(app: FastifyInstance) {
    app.post('/auth/login', postIdentityLogin)
    app.get('/auth/passkeys/authenticate/options', getPasskeyOptions)
    app.post('/auth/passkeys/authenticate/verify', postPasskeyVerify)
    app.get('/auth/sso/start', getSsoStart)
    app.get('/mail/overview', getMailOverview)
    app.get('/mail/search', getMailSearch)
    app.post('/mail/send', postSendMail)
    app.post('/mail/mailboxes', postMailbox)
    app.post('/mail/message/:id/action', postMailAction)
    app.get('/mail/message/:id/reputation', getMailMessageReputation)
    app.post('/mail/filters', postMailFilter)
    app.delete('/mail/filters/:id', deleteMailFilter)
    app.get('/mail/blob/:mailboxUser/:blobId/:name', getMailBlob)
    app.get('/internal/support/mail/inbox', getSupportInbox)
    app.post('/internal/support/mail/send', postSupportMail)
}
