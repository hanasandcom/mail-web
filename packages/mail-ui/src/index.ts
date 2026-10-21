'use client'

import MailWorkspace from './components/mailWorkspace'
import { MailUiApiProvider, useMailUiApi } from './api'
import { MailSelect } from './components/mailSelect'

export { MailWorkspace, MailUiApiProvider, useMailUiApi }
export { MailSelect }
export type { MailSelectOption } from './components/mailSelect'
export type { MailUiApi, MailDraftAttachment, MailRemoteContent } from './api'
export type * from './types'
