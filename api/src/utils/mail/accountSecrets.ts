import { tryDecryptMailSecret } from './crypto.ts'

export function getStoredMailSecret(account: { mail_password_encrypted: string, user_id: string }) {
    const secret = tryDecryptMailSecret(account.mail_password_encrypted)
    if (secret) return secret
    console.warn(`Ignoring undecryptable stored mail secret for ${account.user_id}; account will be resynced.`)
    return null
}
