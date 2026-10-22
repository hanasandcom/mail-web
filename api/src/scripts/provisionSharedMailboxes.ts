import { closeDatabase } from '../utils/db.ts'
import { getMailboxList } from '../utils/mail/jmapMailbox.ts'
import { requireMailAdminConfig } from '../utils/mail/config.ts'
import { provisionConfiguredMailAddresses } from '../utils/mail/accountProvisioning.ts'
import { provisionSharedMailboxes, sharedMailAccess, sharedMailboxes } from '../utils/mail/shared.ts'
import { assertRuntimeConfig } from '../server.ts'

assertRuntimeConfig()
requireMailAdminConfig()

try {
    await provisionConfiguredMailAddresses()
    await provisionSharedMailboxes()

    for (const mailbox of sharedMailboxes) {
        const access = await sharedMailAccess(mailbox.id)
        await getMailboxList(access.username, access.password)
        console.info(`Verified shared mailbox ${mailbox.name}.`)
    }
} finally {
    await closeDatabase()
}
