'use client'

import { MailUiApiProvider, MailWorkspace as SharedMailWorkspace, type MailUiApi } from '@hanasand/mail-ui'
import * as mailApi from '../../utils/mail/client'

const api = mailApi satisfies MailUiApi

export default function MailWorkspace({ mailboxUser }: { mailboxUser?: string | null }) {
    return (
        <MailUiApiProvider api={api}>
            <SharedMailWorkspace mailboxUser={mailboxUser} />
        </MailUiApiProvider>
    )
}
