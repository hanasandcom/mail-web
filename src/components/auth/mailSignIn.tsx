'use client'

import { useState, type FormEvent } from 'react'
import Image from 'next/image'
import { LoaderCircle, LockKeyhole, Mail } from 'lucide-react'
import { removeCookies, setCookieWithExpiresAt } from '@/utils/cookies/cookies'
import { safeMailReturnPath } from './returnPath'

type LoginPayload = {
    id?: string
    name?: string
    avatar?: string | null
    token?: string
    expires_at?: string
    error?: string
}

export default function MailSignIn({ returnTo, initialError }: { returnTo: string, initialError?: string }) {
    const [identifier, setIdentifier] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState(initialError || '')
    const [busy, setBusy] = useState(false)

    async function signIn(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (busy) return

        setBusy(true)
        setError('')
        try {
            const response = await fetch(`/api/auth/login/${encodeURIComponent(identifier.trim())}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
                cache: 'no-store',
                signal: AbortSignal.timeout(15_000),
            })
            const payload = await response.json().catch(() => ({})) as LoginPayload
            if (!response.ok || !payload.id || !payload.name || !payload.token || !payload.expires_at) {
                throw new Error(payload.error || 'Unable to sign in. Check your details and try again.')
            }

            const expiresAt = payload.expires_at
            setCookieWithExpiresAt('name', payload.name, expiresAt)
            setCookieWithExpiresAt('id', payload.id, expiresAt)
            setCookieWithExpiresAt('avatar', payload.avatar || '', expiresAt)
            setCookieWithExpiresAt('access_token', payload.token, expiresAt)
            setCookieWithExpiresAt('session_expires_at', expiresAt, expiresAt)
            setCookieWithExpiresAt('auth_checked_at', new Date().toISOString(), expiresAt)
            removeCookies('roles')
            window.location.replace(safeMailReturnPath(returnTo))
        } catch (reason) {
            setError(messageFor(reason))
            setBusy(false)
        }
    }

    return <main className='grid min-h-dvh place-items-center bg-ui-canvas px-4 py-8 text-ui-text'>
        <section className='w-full max-w-md rounded-2xl border border-ui-border bg-ui-panel p-6 shadow-2xl shadow-black/20 sm:p-8'>
            <div className='mb-8 flex items-center gap-3'>
                <Image src='/hanasand-logo-transparent.png' alt='' width={42} height={42} className='h-10 w-10 object-contain' priority />
                <div>
                    <p className='text-lg font-semibold tracking-tight'>Hanasand Mail</p>
                    <p className='text-sm text-ui-muted'>Sign in to your mailbox</p>
                </div>
            </div>

            <form onSubmit={signIn} className='grid gap-4'>
                <label className='grid gap-1.5 text-sm font-medium' htmlFor='mail-login-identifier'>
                    Email or username
                    <span className='relative'>
                        <Mail aria-hidden='true' className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-muted' />
                        <input
                            id='mail-login-identifier'
                            name='username'
                            type='text'
                            autoComplete='username'
                            autoCapitalize='none'
                            spellCheck={false}
                            required
                            value={identifier}
                            onChange={event => setIdentifier(event.target.value)}
                            className='h-12 w-full rounded-lg border border-ui-border bg-ui-canvas pl-10 pr-3 text-base text-ui-text outline-none transition placeholder:text-ui-muted focus:border-ui-primary focus:ring-2 focus:ring-ui-primary/20'
                            placeholder='name@hanasand.com'
                        />
                    </span>
                </label>
                <label className='grid gap-1.5 text-sm font-medium' htmlFor='mail-login-password'>
                    Password
                    <span className='relative'>
                        <LockKeyhole aria-hidden='true' className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-muted' />
                        <input
                            id='mail-login-password'
                            name='password'
                            type='password'
                            autoComplete='current-password'
                            required
                            value={password}
                            onChange={event => setPassword(event.target.value)}
                            className='h-12 w-full rounded-lg border border-ui-border bg-ui-canvas pl-10 pr-3 text-base text-ui-text outline-none transition placeholder:text-ui-muted focus:border-ui-primary focus:ring-2 focus:ring-ui-primary/20'
                            placeholder='Enter your password'
                        />
                    </span>
                </label>

                {error && <p role='alert' aria-live='polite' className='rounded-lg border border-ui-danger/50 bg-ui-raised px-3 py-2.5 text-sm leading-5 text-ui-text'>{error}</p>}

                <button
                    type='submit'
                    disabled={busy || !identifier.trim() || !password}
                    className='mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-ui-primary px-4 text-sm font-semibold text-ui-on-primary transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-primary disabled:cursor-wait disabled:opacity-60'
                >
                    {busy && <LoaderCircle aria-hidden='true' className='h-4 w-4 animate-spin' />}
                    {busy ? 'Signing in…' : 'Sign in'}
                </button>
            </form>

            <p className='mt-6 text-center text-xs leading-5 text-ui-muted'>Your sign-in stays within Hanasand Mail.</p>
        </section>
    </main>
}

function messageFor(reason: unknown) {
    if (reason instanceof Error && reason.name === 'TimeoutError') return 'Sign-in took too long. Try again.'
    if (reason instanceof Error && reason.message) return reason.message
    return 'Unable to sign in right now. Try again.'
}
