const INLINE_RASTER_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
const PDF_SIGNATURE = '%PDF-'

export function blobResponsePolicy(upstreamType: string, filename: string, bytes: Uint8Array) {
    const declared = upstreamType.split(';', 1)[0]?.trim().toLowerCase() || ''
    const safeInline = INLINE_RASTER_TYPES.has(declared) && matchesRasterSignature(declared, bytes)
    const safePdf = matchesPdfSignature(bytes)
    const contentType = safeInline ? declared : safePdf ? 'application/pdf' : 'application/octet-stream'
    return {
        contentType,
        contentDisposition: `${safeInline ? 'inline' : 'attachment'}; ${contentDispositionFilename(filename)}`,
        contentSecurityPolicy: 'default-src \'none\'; sandbox',
        nosniff: 'nosniff',
    }
}

function matchesPdfSignature(bytes: Uint8Array) {
    const headerEnd = Math.min(bytes.length - PDF_SIGNATURE.length, 1024)
    for (let offset = 0; offset <= headerEnd; offset += 1) {
        if ([...PDF_SIGNATURE].every((char, index) => bytes[offset + index] === char.charCodeAt(0))) return true
    }
    return false
}

export function contentDispositionFilename(input: string) {
    // eslint-disable-next-line no-control-regex
    const cleaned = input.normalize('NFKC').replace(/[\\/\u0000-\u001f\u007f]/g, '_').replace(/^[. ]+|[. ]+$/g, '').slice(0, 180) || 'attachment'
    const fallback = cleaned.replace(/[^\x20-\x7e]/g, '_').replace(/["\\;]/g, '_') || 'attachment'
    const encoded = encodeURIComponent(cleaned).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    return `filename="${fallback}"; filename*=UTF-8''${encoded}`
}

function matchesRasterSignature(type: string, bytes: Uint8Array) {
    if (type === 'image/png') return bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 'PNG') && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
    if (type === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    if (type === 'image/gif') return bytes.length >= 6 && (ascii(bytes, 0, 'GIF87a') || ascii(bytes, 0, 'GIF89a'))
    if (type === 'image/webp') return bytes.length >= 12 && ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WEBP')
    return false
}

function ascii(bytes: Uint8Array, offset: number, value: string) {
    return [...value].every((char, index) => bytes[offset + index] === char.charCodeAt(0))
}
