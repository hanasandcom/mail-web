import crypto from 'node:crypto'

export function deriveSecretKey(source: string) {
    return crypto.createHash('sha256').update(source).digest()
}

export function encryptSecret(value: string, key: Buffer) {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`
}

export function decryptSecret(value: string, keys: Buffer[]) {
    const [ivB64, tagB64, dataB64] = value.split('.')
    if (!ivB64 || !tagB64 || !dataB64) return value

    for (const key of keys) {
        try {
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
            decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
            return Buffer.concat([
                decipher.update(Buffer.from(dataB64, 'base64')),
                decipher.final(),
            ]).toString('utf8')
        } catch {
            // A previous key can decrypt records until their ciphertext is migrated.
        }
    }

    throw new Error('Unable to decrypt secret with the configured keys.')
}
