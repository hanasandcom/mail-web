import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import Script from 'next/script'
import './globals.css'

export const metadata = {
    title: 'Hanasand Mail',
    description: 'Hanasand mail',
    robots: { index: false, follow: false },
}

export default async function RootLayout({ children }: { children: ReactNode }) {
    const theme = (await cookies()).get('theme')?.value === 'light' ? 'light' : 'dark'
    const canvas = theme === 'light' ? '#f5f5f5' : '#070707'
    return <html lang='en' className={theme} style={{ backgroundColor: canvas, colorScheme: theme }}><body style={{ backgroundColor: canvas }}><Script src='https://api.hanasand.com/api/auth/device-proof-client.js' strategy='afterInteractive' />{children}</body></html>
}
