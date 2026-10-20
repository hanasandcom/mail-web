import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()

test('mail workspace uses shared dashboard chrome and compact operational geometry', async () => {
    const files = await Promise.all([
        readFile(path.join(root, 'src/components/mail/mailWorkspace.tsx'), 'utf8'),
        readFile(path.join(root, 'src/components/mail/mailWorkspaceParts.tsx'), 'utf8'),
        readFile(path.join(root, 'src/components/mail/utils.tsx'), 'utf8'),
    ])
    const workspace = files[0]
    const combined = files.join('\n')

    expect(workspace).toContain('id=\'mail-toolbar\'')
    expect(workspace).not.toContain('Recommended next')
    expect(workspace).toContain('DashboardPage')
    expect(workspace).toContain('data-mail-counts')
    expect(workspace).toContain('mail-compose-button')
    expect(workspace).not.toContain('Mailbox is ready')
    expect(workspace).toContain('Create')
    expect(workspace).toContain('data-mail-filter-strip')
    expect(workspace).toContain('data-mail-admin-trigger')
    expect(workspace).toContain('data-mail-admin-drawer')
    expect(workspace).toContain('data-mail-sync-status')
    expect(workspace).toContain('function MailSyncStatus')
    expect(workspace).toContain('unreachableSince={unreachableSince}')
    expect(workspace).toContain('Last updated {time}{date}')
    expect(workspace).toContain('The mail service closed the connection before the mailbox loaded.')
    expect(workspace).not.toContain('>health {health}</span>')
    expect(workspace).toContain('Mailbox admin')
    expect(workspace).toContain('buildMailListFilters(overview?.messages || [])')
    expect(workspace).toContain('messageMatchesMailFilter(message, mailFilter)')
    expect(workspace).toContain('label: \'Unread\'')
    expect(workspace).toContain('label: \'Starred\'')
    expect(workspace).toContain('label: \'Attachments\'')
    expect(workspace).not.toContain('Needs filing')
    expect(workspace).toContain('No messages match the current view.')
    expect(workspace).toContain('function buildMailListFilters')
    expect(workspace).toContain('function messageMatchesMailFilter')
    expect(workspace.indexOf('data-mail-admin-trigger')).toBeLessThan(workspace.indexOf('data-mail-admin-drawer'))
    expect(workspace.indexOf('data-mail-admin-drawer')).toBeLessThan(workspace.indexOf('Filing rules'))
    expect(workspace.indexOf('data-mail-admin-drawer')).toBeLessThan(workspace.indexOf('Mail health'))
    expect(workspace).toContain('<MailSyncStatus lastSuccessAt={lastSuccessAt} unreachableSince={unreachableSince} now={now} full />')
    expect(workspace.indexOf('data-mail-admin-drawer')).toBeLessThan(workspace.indexOf('Client access'))
    expect(combined).not.toMatch(/rounded-(?:xl|2xl|3xl)/)
    expect(combined).not.toMatch(/rounded-\\[[^\\]]+\\]/)
})
