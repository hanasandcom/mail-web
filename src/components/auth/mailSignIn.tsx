'use client'

import { createElement, useEffect, useRef, type FormEvent } from 'react'
import Image from 'next/image'
import Script from 'next/script'
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
        void customElements.whenDefined('hanasand-login-form').then(() => sharedLoginForm()?.setError(initialError || ''))
    }, [initialError])

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
            loginForm.setError(messageFor(reason))
            loginForm.setBusy(false)
            form.dataset.busy = 'false'
        }
    }

    return <main className='grid min-h-dvh place-items-center bg-ui-canvas px-4 py-8 text-ui-text'>
        <Script src='https://api.hanasand.com/api/auth/login-form.js' strategy='afterInteractive' />
        <section className='w-full max-w-md rounded-2xl border border-ui-border bg-ui-panel p-6 shadow-2xl shadow-black/20 sm:p-8'>
            <div className='mb-8 flex items-center gap-3'>
                <Image src='/hanasand-logo-transparent.png' alt='' width={42} height={42} className='h-10 w-10 object-contain' priority />
                <div>
                    <p className='text-lg font-semibold tracking-tight'>Hanasand Mail</p>
                </div>
            </div>

            <form ref={formRef} onSubmit={signIn} className='grid gap-4'>
                {createElement('hanasand-login-form', {
                    'identifier-label': 'Email or username',
                    'identifier-placeholder': 'name@hanasand.com',
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
