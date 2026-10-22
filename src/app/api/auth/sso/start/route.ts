import { NextRequest, NextResponse } from 'next/server'
import { safeMailReturnPath } from '@/components/auth/returnPath'

export function GET(req: NextRequest) {
    const returnPath = safeMailReturnPath(req.nextUrl.searchParams.get('returnTo') || '/')
    const returnTo = `https://mail.hanasand.com${returnPath}`
    const target = new URL('https://hanasand.com/api/auth/sso/start')
    target.searchParams.set('returnTo', returnTo)
    const response = NextResponse.redirect(target, 303)
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('Referrer-Policy', 'no-referrer')
    return response
}
