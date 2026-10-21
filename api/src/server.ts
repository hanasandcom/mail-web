import cors from '@fastify/cors'
import Fastify from 'fastify'
import { isIP } from 'node:net'
import { registerMailRoutes } from './routes.ts'
import { mailConfig } from './utils/mail/config.ts'
import run from './utils/db.ts'

const origins = (process.env.MAIL_API_CORS_ORIGINS || 'https://mail.hanasand.com,https://hanasand.com,https://www.hanasand.com')
    .split(',').map(origin => origin.trim()).filter(Boolean)

export async function createServer() {
    const app = Fastify({ logger: true, bodyLimit: 25 * 1024 * 1024 })
    await app.register(cors, {
        origin: (origin, callback) => callback(null, !origin || origins.includes(origin)),
        methods: ['GET', 'POST', 'DELETE', 'OPTIONS', 'HEAD'],
        allowedHeaders: ['authorization', 'content-type', 'id', 'dpop', 'idempotency-key'],
        exposedHeaders: ['x-access-token', 'x-access-token-expires-at'],
        credentials: false,
    })
    app.get('/health', async (_request, reply) => {
        reply.header('Cache-Control', 'no-store')
        try {
            await run('SELECT 1')
            return { ok: true, service: 'mail-api' }
        } catch {
            return reply.code(503).send({ ok: false, service: 'mail-api' })
        }
    })
    app.register(registerMailRoutes, { prefix: '/api' })
    app.addHook('onClose', async () => {
        const { closeDatabase } = await import('./utils/db.ts')
        await closeDatabase()
    })
    return app
}

export function assertRuntimeConfig() {
    const required: Array<[string, string | undefined]> = [
        ['HANASAND_IDENTITY_SERVICE_URL', process.env.HANASAND_IDENTITY_SERVICE_URL],
        ['HANASAND_IDENTITY_SERVICE_TOKEN', process.env.HANASAND_IDENTITY_SERVICE_TOKEN],
        ['MAIL_SERVICE_KEY', process.env.MAIL_SERVICE_KEY],
        ['MAIL_INTERNAL_URL', process.env.MAIL_INTERNAL_URL || process.env.MAIL_JMAP_INTERNAL_URL],
    ]
    const missing = required.filter(([, value]) => !value?.trim()).map(([name]) => name)
    const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim())
    const hasDatabaseParts = Boolean(process.env.PGHOST?.trim() && process.env.PGUSER?.trim()
        && process.env.PGPASSWORD?.trim() && process.env.PGDATABASE?.trim())
    if (!hasDatabaseUrl && !hasDatabaseParts) missing.push('DATABASE_URL or PGHOST/PGUSER/PGPASSWORD/PGDATABASE')
    if (missing.length) throw new Error(`Missing required mail API configuration: ${missing.join(', ')}`)
    const identity = new URL(process.env.HANASAND_IDENTITY_SERVICE_URL!)
    if (!['http:', 'https:'].includes(identity.protocol) || identity.username || identity.password || identity.pathname !== '/' || identity.search || identity.hash || !isPrivateServiceHost(identity.hostname)) {
        throw new Error('HANASAND_IDENTITY_SERVICE_URL must be a private HTTP(S) service origin.')
    }
    const mailInternalUrl = new URL(mailConfig.internalUrl)
    if (!['http:', 'https:'].includes(mailInternalUrl.protocol) || !isPrivateServiceHost(mailInternalUrl.hostname)) {
        throw new Error('MAIL_INTERNAL_URL must point to a private HTTP(S) Stalwart service.')
    }
}

function isPrivateServiceHost(hostname: string) {
    const host = hostname.toLowerCase()
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.svc.cluster.local')) return true
    if (!host.includes('.')) return true
    if (isIP(host) === 4) {
        const [first, second] = host.split('.').map(Number)
        return first === 10 || first === 127 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168)
    }
    if (isIP(host) === 6) return host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')
    return false
}
