import assert from 'node:assert/strict'
import { resolveMailProxyAuth } from '../src/utils/mail/proxyAuth'

const headers = new Headers({ authorization: 'Bearer current-token', id: 'current-user' })
assert.deepEqual(resolveMailProxyAuth(headers, 'stale-token', 'stale-user'), {
    token: 'current-token',
    id: 'current-user',
})

assert.deepEqual(resolveMailProxyAuth(new Headers(), 'cookie-token', 'cookie-user'), {
    token: 'cookie-token',
    id: 'cookie-user',
})

const malformedAuthorization = new Headers({ authorization: 'Basic ignored', id: 'current-user' })
assert.deepEqual(resolveMailProxyAuth(malformedAuthorization, 'cookie-token', 'cookie-user'), {
    token: 'cookie-token',
    id: 'current-user',
})

console.log('Mail proxy auth checks passed (3 cases).')
