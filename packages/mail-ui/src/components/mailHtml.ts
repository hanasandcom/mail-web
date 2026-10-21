export function buildMailFrameHtml(html: string, theme: 'light' | 'dark' = 'light', remoteImageUrls: string[] = []) {
    const remoteImageSources = remoteImageUrls.flatMap(value => {
        try {
            const url = new URL(value)
            if (!['http:', 'https:'].includes(url.protocol)) return []
            return [`${url.origin}${url.pathname}`]
        } catch {
            return []
        }
    })
    const imagePolicy = ["'self'", 'data:', 'blob:', ...remoteImageSources].join(' ')
    const policy = `default-src 'none'; img-src ${imagePolicy}; style-src 'unsafe-inline'; font-src 'self' data:; frame-src 'none'; media-src 'none'; object-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'`
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="${policy}" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root { color-scheme: ${theme}; }
    html, body {
      margin: 0;
      padding: 0;
      background: transparent;
      color: CanvasText;
      font-family: Manrope, Aptos, sans-serif;
    }
    body {
      padding: 12px;
      font-size: 14px;
      line-height: 1.6;
    }
    img, iframe, video {
      max-width: 100%;
      height: auto;
      border-radius: 14px;
    }
    a { color: LinkText; }
    table { max-width: 100%; }
    pre, code {
      white-space: pre-wrap;
      word-break: break-word;
    }
  </style>
</head>
<body>${html}</body>
</html>`
}

export function htmlWithApprovedRemoteImages(html: string, safeRemoteUrls: string[]) {
    const normalizedSafeUrls = new Set(safeRemoteUrls.flatMap(value => {
        const normalized = normalizeRemoteImageUrl(value)
        return normalized ? [normalized] : []
    }))
    const parsed = new DOMParser().parseFromString(html, 'text/html')

    // Keep the message readable while preventing every non-image resource path.
    parsed.querySelectorAll('script, iframe, frame, frameset, object, embed, video, audio, source, track, link, base, style, svg, meta[http-equiv]').forEach(node => node.remove())
    parsed.querySelectorAll('[style], [background], [srcset], [poster], [data]').forEach(node => {
        node.removeAttribute('style')
        node.removeAttribute('background')
        node.removeAttribute('srcset')
        node.removeAttribute('poster')
        node.removeAttribute('data')
    })
    parsed.querySelectorAll('[src]').forEach(node => {
        const src = node.getAttribute('src') || ''
        if (node.tagName.toLowerCase() !== 'img') {
            node.removeAttribute('src')
            return
        }
        const normalized = normalizeRemoteImageUrl(src)
        if (normalized && normalizedSafeUrls.has(normalized)) {
            node.setAttribute('src', normalized)
        } else if (!src.startsWith('/') || src.startsWith('//')) {
            if (src.toLowerCase().startsWith('data:image/')) return
            node.removeAttribute('src')
        }
    })

    return parsed.body.innerHTML
}

export function normalizeRemoteImageUrl(value: string) {
    try {
        const url = new URL(value)
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
        url.hash = ''
        return url.href
    } catch {
        return null
    }
}

export function remoteImageUrlsFromHtml(html: string) {
    const parsed = new DOMParser().parseFromString(html, 'text/html')
    return new Set(Array.from(parsed.querySelectorAll('img[src]'), image => {
        const src = image.getAttribute('src') || ''
        return normalizeRemoteImageUrl(src)
    }).filter((url): url is string => Boolean(url)))
}
