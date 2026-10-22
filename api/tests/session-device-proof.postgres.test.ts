import { expect, test } from 'bun:test'
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import Fastify from 'fastify'
import { validateMailSession } from '../src/utils/auth/session.ts'

// Explicitly opt in using a disposable Docker database and an immutable Identity checkout.
const enabled = process.env.RUN_MAIL_IDENTITY_DB_TESTS === '1'
const stagingTest = enabled ? test : test.skip
stagingTest('Mail auth boundary with real Identity HTTP, PostgreSQL, P-256 binding and replay rejection', async () => {
    if (process.env.DB !== 'mail_device_proof_stage' || process.env.DB_HOST !== 'mail-bound-proof-db' || process.env.DB_USER !== 'synthetic' || process.env.IDENTITY_SOURCE_DIR !== '/identity') throw new Error('Requires isolated Mail device-proof staging.')
    const source = process.env.IDENTITY_SOURCE_DIR
    const { default: query, closeDatabase } = await import(`${source}/src/utils/db.ts`)
    const { issueToken } = await import(`${source}/src/utils/auth/session.ts`)
    const id = `mail-proof-${randomUUID()}`
    const tokenFor = async (key?: ReturnType<typeof generateKeyPairSync>['publicKey']) => (await issueToken({ id, ip: '127.0.0.1', userAgent: 'Synthetic Mail auth staging', ...(key ? { devicePublicJwk: key.export({ format: 'jwk' }) } : {}) }))!.token
    const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    const wrongKeys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    const url = 'https://mail.hanasand.com/api/mail/overview'
    const proof = (token: string, options: { keys?: typeof keys; url?: string; method?: string; age?: number } = {}) => {
        const pair = options.keys || keys
        const header = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'dpop+jwt', jwk: pair.publicKey.export({ format: 'jwk' }) })).toString('base64url')
        const claims = Buffer.from(JSON.stringify({ htm: options.method || 'GET', htu: options.url || url, iat: Math.floor(Date.now() / 1000) - (options.age || 0), jti: randomUUID(), ath: createHash('sha256').update(token).digest('base64url') })).toString('base64url')
        const content = `${header}.${claims}`
        return `${content}.${sign('sha256', Buffer.from(content), { key: pair.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`
    }
    let identity: ReturnType<typeof Fastify> | undefined
    const mail = Fastify({ logger: false })
    let inserted = false
    try {
        for (const migration of ['001_identity.sql', '002_identity_admin.sql', '003_profile_ssh_key_usage.sql', '004_oidc_provider_transactions.sql', '005_mobile_sso_codes.sql', '006_session_device_proof.sql']) await query(await Bun.file(`${source}/migrations/${migration}`).text())
        await query("INSERT INTO users (id,name,password,avatar,active) VALUES ($1,'Synthetic Mail auth','disabled','',true)", [id]); inserted = true
        const bound = await tokenFor(keys.publicKey)
        const legacy = await tokenFor()
        const { createAuthServer } = await import(`${source}/src/authServer.ts`)
        identity = createAuthServer(); identity!.log.level = 'silent'
        await identity!.listen({ host: '127.0.0.1', port: 0 })
        const address = identity!.server.address()
        if (!address || typeof address === 'string') throw new Error('No Identity staging listener.')
        process.env.HANASAND_IDENTITY_SERVICE_URL = `http://127.0.0.1:${address.port}`
        // Reproduce the old first failing hop against the real registered Identity route.
        const before = await fetch(`${process.env.HANASAND_IDENTITY_SERVICE_URL}/api/auth/internal/sessions`, { method: 'POST', headers: { authorization: `Bearer ${process.env.HANASAND_IDENTITY_SERVICE_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ operation: 'validate', id, token: bound }) })
        expect(before.status).toBe(401)
        // Exercise the unchanged Mail auth adapter over real HTTP, without accessing mailboxes or sending mail.
        mail.route({ method: ['GET', 'POST'], url: '/api/mail/:action', handler: async (request, reply) => { const result = await validateMailSession(request, reply); if (!result) return reply.sent ? reply : reply.code(401).send({ error: 'Unauthorized.' }); return { authorized: true, id: result.id } } })
        await mail.listen({ host: '127.0.0.1', port: 0 })
        const mailAddress = mail.server.address()
        if (!mailAddress || typeof mailAddress === 'string') throw new Error('No Mail staging listener.')
        const request = (token: string, signed?: string, headers: Record<string, string> = {}, method = 'GET', path = '/api/mail/overview') => fetch(`http://127.0.0.1:${mailAddress.port}${path}`, { method, headers: { authorization: `Bearer ${token}`, id, ...(signed ? { dpop: signed } : {}), ...headers } })
        expect((await request(bound)).status).toBe(401)
        const signed = proof(bound)
        const accepted = await request(bound, signed, { 'x-device-proof-url': url, 'x-device-proof-method': 'GET' })
        expect(accepted.status).toBe(200)
        expect((await accepted.json()).authorized).toBe(true)
        expect((await query('SELECT count(*)::int AS count FROM session_device_proof_jtis')).rows[0].count).toBe(1)
        expect((await request(bound, signed)).status).toBe(401)
        expect((await request(bound, proof(bound, { keys: wrongKeys }))).status).toBe(401)
        expect((await request(bound, proof(bound, { age: 90 }))).status).toBe(401)
        expect((await request(bound, proof(bound, { url: 'https://mail.hanasand.com/api/mail/search' }), { 'x-device-proof-url': 'https://mail.hanasand.com/api/mail/search' })).status).toBe(401)
        expect((await request(bound, proof(bound, { method: 'POST' }), { 'x-device-proof-method': 'POST' })).status).toBe(401)
        expect((await request(bound, proof(legacy))).status).toBe(401)
        expect((await request(bound, proof(bound), { 'x-device-proof-method': 'GET', 'x-device-proof-url': url }, 'POST', '/api/mail/mailboxes')).status).toBe(401)
        expect((await request(legacy)).status).toBe(200)
        expect((await request(bound, proof(bound, { url: 'https://mail.hanasand.com/api/mail/mailboxes', method: 'POST' }), {}, 'POST', '/api/mail/mailboxes')).status).toBe(200)
        const cookie = await fetch(`http://127.0.0.1:${mailAddress.port}/api/mail/overview`, { headers: { host: 'mail.hanasand.com', origin: 'https://mail.hanasand.com', cookie: `id=${id}; access_token=${bound}`, dpop: proof(bound) } })
        expect(cookie.status).toBe(200)
        await query('UPDATE users SET active=false WHERE id=$1', [id])
        expect((await request(bound, proof(bound))).status).toBe(401)
        await query('UPDATE users SET active=true,deletion_scheduled_at=NOW() WHERE id=$1', [id])
        expect((await request(bound, proof(bound))).status).toBe(401)
    } finally {
        await mail.close(); await identity?.close()
        if (inserted) { await query('DELETE FROM users WHERE id=$1', [id]); expect((await query('SELECT count(*)::int AS count FROM tokens WHERE id=$1', [id])).rows[0].count).toBe(0) }
        await closeDatabase()
    }
}, 30000)
