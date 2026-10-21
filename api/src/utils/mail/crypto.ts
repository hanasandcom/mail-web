import crypto from 'node:crypto'
import { mailConfig } from './config.ts'
import { decryptSecret, encryptSecret } from '../crypto/secretBox.ts'

export function encryptMailSecret(value: string) {
    return encryptSecret(value, mailConfig.encryptionKey)
}

export function decryptMailSecret(value: string) {
    return decryptSecret(value, mailConfig.decryptionKeys)
}

export function tryDecryptMailSecret(value: string) {
    try {
        return decryptMailSecret(value)
    } catch {
        return null
    }
}

export function generateMailSecret() {
    return crypto.randomBytes(24).toString('base64url')
}
