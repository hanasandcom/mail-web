import { describe, expect, it } from 'bun:test'
import { blobResponsePolicy } from '#utils/mail/blobResponsePolicy.ts'

describe('attachment response policy', () => {
    it.each([
        ['HTML', 'text/html', '<script>alert(1)</script>'],
        ['SVG', 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
    ])('forces %s attachment bytes to download as inert data', (_label, contentType, body) => {
        const policy = blobResponsePolicy(contentType, 'active-content.file', new TextEncoder().encode(body))
        expect(policy.contentType).toBe('application/octet-stream')
        expect(policy.contentDisposition).toStartWith('attachment;')
        expect(policy.nosniff).toBe('nosniff')
        expect(policy.contentSecurityPolicy).toContain('sandbox')
    })
})
