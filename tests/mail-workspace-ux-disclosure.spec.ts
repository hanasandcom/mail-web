import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()

test('standalone hostname renders shared mail UI and calls its own API', async () => {
    const [page, workspace, client, selector, toolbar] = await Promise.all([
        readFile(path.join(root, 'src/app/page.tsx'), 'utf8'),
        readFile(path.join(root, 'src/components/mail/mailWorkspace.tsx'), 'utf8'),
        readFile(path.join(root, 'src/utils/mail/client.transport.ts'), 'utf8'),
        readFile(path.join(root, 'packages/mail-ui/src/components/mailSelect.tsx'), 'utf8'),
        readFile(path.join(root, 'packages/mail-ui/src/components/mailWorkspaceToolbar.tsx'), 'utf8'),
    ])

    expect(page).toContain('mailIdentityLoginUrl(returnTo, expired)')
    expect(page).toContain('if (!hasSession || expired)')
    expect(page).not.toContain('MailSignIn')
    expect(page).toContain('redirect(')
    expect(page).not.toContain('hanasand.com/dashboard/mail')
    expect(workspace).toContain("from 'hanasand/mail'")
    expect(workspace).toContain('<MailUiApiProvider api={api}>')
    expect(client).toContain("process.env.NEXT_PUBLIC_MAIL_API_BASE || '/api'")
    expect(client).not.toContain('api.hanasand.com')
    expect(selector).toContain('p-1.5')
    expect(selector).toContain('h-6 w-6 shrink-0')
    expect(selector).not.toContain('border-l border-ui-border/70')
    expect(toolbar).toContain('id=\'mail-toolbar\'')
    expect(toolbar).toContain('data-testid=\'mail-compose-button\'')
    expect(toolbar).toContain('disabled={!overview || overview.actor.canSend === false}')
    expect(toolbar).not.toContain('disabled={!overview || loading || overview.actor.canSend === false}')
})
