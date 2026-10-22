'use client'

import { createElement, useEffect, useRef, type FormEvent } from 'react'
import { registerHanasandLoginForm } from 'hanasand/auth'
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
    const formRef = useRef<HTMLFormElement>(null)
    const sharedLoginForm = () => formRef.current?.querySelector('hanasand-login-form') as (HTMLElement & {
        setBusy(busy: boolean): void
        setError(message: string): void
    }) | null

    useEffect(() => {
        registerHanasandLoginForm()
        let loginForm: ReturnType<typeof sharedLoginForm> = null
        const onAuthenticated = (event: Event) => {
            const payload = (event as CustomEvent<LoginPayload>).detail
            if (!payload?.id || !payload.name || !payload.token || !payload.expires_at) return
            event.preventDefault()
            setCookieWithExpiresAt('name', payload.name, payload.expires_at)
            setCookieWithExpiresAt('id', payload.id, payload.expires_at)
            setCookieWithExpiresAt('avatar', payload.avatar || '', payload.expires_at)
            setCookieWithExpiresAt('access_token', payload.token, payload.expires_at)
            setCookieWithExpiresAt('session_expires_at', payload.expires_at, payload.expires_at)
            setCookieWithExpiresAt('auth_checked_at', new Date().toISOString(), payload.expires_at)
            removeCookies('roles')
            window.location.replace(safeMailReturnPath(returnTo))
        }
        void customElements.whenDefined('hanasand-login-form').then(() => {
            loginForm = sharedLoginForm()
            loginForm?.setError(initialError || '')
            loginForm?.addEventListener('hanasand-authenticated', onAuthenticated)
        })
        return () => loginForm?.removeEventListener('hanasand-authenticated', onAuthenticated)
    }, [initialError, returnTo])

    async function signIn(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const form = event.currentTarget
        if (form.dataset.busy === 'true') return

        const formData = new FormData(form)
        const identifier = String(formData.get('username') || '').trim()
        const password = String(formData.get('password') || '')
        const loginForm = sharedLoginForm()
        if (!loginForm) return
        form.dataset.busy = 'true'
        loginForm.setBusy(true)
        loginForm.setError('')
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
            const message = messageFor(reason)
            loginForm.setError(message)
            loginForm.setBusy(false)
            form.dataset.busy = 'false'
        }
    }

    return <main className='grid min-h-dvh place-items-center bg-ui-canvas px-4 py-8 text-ui-text'>
        <section className='w-full max-w-md rounded-2xl border border-ui-border bg-ui-panel p-6 shadow-2xl shadow-black/20 sm:p-8'>
            <form ref={formRef} onSubmit={signIn} className='grid gap-4'>
                {createElement('hanasand-login-form', {
                    'identifier-label': 'Email or username',
                    'identifier-placeholder': 'name@hanasand.com',
                    'sso-href': `/api/auth/sso/start?returnTo=${encodeURIComponent(returnTo)}`,
                    'passkey-options-url': '/api/auth/passkeys/authenticate/options',
                    'passkey-verify-url': '/api/auth/passkeys/authenticate/verify',
                })}
            </form>

        </section>
    </main>
}

function messageFor(reason: unknown) {
    if (reason instanceof Error && reason.name === 'TimeoutError') return 'Sign-in took too long. Try again.'
    if (reason instanceof Error && reason.message) return reason.message
    return 'Unable to sign in right now. Try again.'
}
