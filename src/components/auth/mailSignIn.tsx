'use client'

import { createElement, useEffect, useRef } from 'react'
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
}

export default function MailSignIn({ returnTo, initialError }: { returnTo: string, initialError?: string }) {
    const formRef = useRef<HTMLDivElement>(null)
    const redirectPath = safeMailReturnPath(returnTo)

    useEffect(() => {
        const root = formRef.current
        if (!root) return
        void customElements.whenDefined('hanasand-login-form').then(() => {
            const form = root.querySelector('hanasand-login-form') as (HTMLElement & { setError(message: string): void }) | null
            form?.setError(initialError || '')
        })
    }, [initialError])

    useEffect(() => {
        const onAuthSuccess = (event: Event) => {
            const payload = (event as CustomEvent<{ response?: LoginPayload }>).detail?.response
            if (!payload?.id || !payload.name || !payload.token || !payload.expires_at) return
            const expiresAt = payload.expires_at
            setCookieWithExpiresAt('name', payload.name, expiresAt)
            setCookieWithExpiresAt('id', payload.id, expiresAt)
            setCookieWithExpiresAt('avatar', payload.avatar || '', expiresAt)
            setCookieWithExpiresAt('access_token', payload.token, expiresAt)
            setCookieWithExpiresAt('session_expires_at', expiresAt, expiresAt)
            setCookieWithExpiresAt('auth_checked_at', new Date().toISOString(), expiresAt)
            removeCookies('roles')
        }
        window.addEventListener('hanasand-auth-success', onAuthSuccess)
        return () => window.removeEventListener('hanasand-auth-success', onAuthSuccess)
    }, [])

    const ssoHref = `/api/auth/sso/start?redirectPath=${encodeURIComponent(redirectPath)}`

    return <main className='grid min-h-dvh place-items-center bg-ui-canvas px-4 py-8 text-ui-text'>
        <Script src='https://api.hanasand.com/api/auth/login-form.js' strategy='afterInteractive' />
        <section className='w-full max-w-md rounded-2xl border border-ui-border bg-ui-panel p-6 shadow-2xl shadow-black/20 sm:p-8'>
            <div className='mb-8 flex items-center gap-3'>
                <Image src='/hanasand-logo-transparent.png' alt='' width={42} height={42} className='h-10 w-10 object-contain' priority />
                <p className='text-lg font-semibold tracking-tight'>Hanasand Mail</p>
            </div>
            <div ref={formRef} className='grid gap-4'>
                {createElement('hanasand-login-form', {
                    'login-url': '/api/auth/login',
                    'passkey-options-url': '/api/auth/passkeys/authenticate/options',
                    'passkey-verify-url': '/api/auth/passkeys/authenticate/verify',
                    'sso-href': ssoHref,
                    'redirect-path': redirectPath,
                    'identifier-label': 'Email or username',
                    'identifier-placeholder': 'name@hanasand.com',
                    'submit-label': 'Sign in',
                })}
            </div>
        </section>
    </main>
}
