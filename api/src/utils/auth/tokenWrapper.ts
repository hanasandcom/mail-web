import type { FastifyReply, FastifyRequest } from 'fastify'
import { validateMailSession } from './session.ts'

export default async function tokenWrapper(req: FastifyRequest, reply: FastifyReply) {
    const session = await validateMailSession(req, reply)
    return session ? { valid: true, id: session.id } : { valid: false, id: undefined }
}
