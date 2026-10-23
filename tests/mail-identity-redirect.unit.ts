import assert from 'node:assert/strict'
import test from 'node:test'
import { mailIdentityLoginUrl, safeMailReturnPath } from '../src/utils/auth/mailReturnPath'

test('Identity redirects return to Mail and carry expired-session context', () => {
    const destination = new URL(mailIdentityLoginUrl('/?mailboxUser=support%40hanasand.com', true))

    assert.equal(destination.origin, 'https://identity.hanasand.com')
    assert.equal(destination.pathname, '/login')
    assert.equal(destination.searchParams.get('returnTo'), 'https://mail.hanasand.com/?mailboxUser=support%40hanasand.com')
    assert.equal(destination.searchParams.get('expired'), 'true')
})

test('Mail return paths cannot escape the origin and do not preserve expired=true', () => {
    assert.equal(safeMailReturnPath('//evil.example/path'), '/')
    assert.equal(safeMailReturnPath('https://evil.example/path'), '/')
    assert.equal(safeMailReturnPath('/?mailboxUser=alice&expired=true'), '/?mailboxUser=alice')
    assert.equal(safeMailReturnPath('/?expired=true'), '/')
})
