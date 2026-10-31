/**
 * Thin, typed wrappers around the `GM_*` API surface.
 *
 * Everything here has a browser-storage / fetch fallback so the app can also
 * run under Vitest (jsdom) and in the Vite dev preview where no userscript
 * manager is present.
 *
 * Detection uses `typeof GM_x === 'function'` instead of looking the name up on
 * `globalThis`: Tampermonkey and Violentmonkey both put GM APIs in the script's
 * scope, but not every manager exposes them as properties of the global object.
 */

export function getPageWindow(): Window & typeof globalThis {
  // With `@grant` set, userscript managers expose the page's real window next
  // to the sandbox. `window` in the sandbox is a proxy that is good enough for
  // most work, but Weibo's SPA router needs the real object.
  return typeof unsafeWindow !== 'undefined' ? unsafeWindow : (window as Window & typeof globalThis)
}

export function gmGetValue<T>(key: string, fallback?: T): T | undefined {
  if (typeof GM_getValue !== 'function') {
    const raw = globalThis.localStorage?.getItem(`xb:${key}`)
    if (raw == null) return fallback
    try {
      return JSON.parse(raw) as T
    } catch {
      return fallback
    }
  }

  const raw = GM_getValue<unknown>(key)
  if (raw === undefined) return fallback
  if (typeof raw !== 'string') return raw as T

  try {
    return JSON.parse(raw) as T
  } catch {
    return raw as unknown as T
  }
}

export function gmSetValue(key: string, value: unknown): void {
  const serialized = JSON.stringify(value)

  if (typeof GM_setValue !== 'function') {
    globalThis.localStorage?.setItem(`xb:${key}`, serialized)
    return
  }

  GM_setValue(key, serialized)
}

export function gmDeleteValue(key: string): void {
  if (typeof GM_deleteValue !== 'function') {
    globalThis.localStorage?.removeItem(`xb:${key}`)
    return
  }

  GM_deleteValue(key)
}

export function gmListValues(): string[] {
  if (typeof GM_listValues !== 'function') {
    return Object.keys(globalThis.localStorage ?? {})
      .filter((key) => key.startsWith('xb:'))
      .map((key) => key.slice(3))
  }

  return GM_listValues()
}

export function gmAddValueChangeListener(
  key: string,
  listener: (key: string, oldValue: unknown, newValue: unknown, remote: boolean) => void,
): string | number | null {
  if (typeof GM_addValueChangeListener !== 'function') return null

  return GM_addValueChangeListener<unknown>(key, (name, oldValue, newValue, remote) => {
    listener(name, parseStoredValue(oldValue), parseStoredValue(newValue), Boolean(remote))
  })
}

export function gmRemoveValueChangeListener(listenerId: string | number | null): void {
  if (listenerId == null || typeof GM_removeValueChangeListener !== 'function') return
  GM_removeValueChangeListener(listenerId)
}

function parseStoredValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export interface GmResponse {
  status: number
  statusText: string
  responseHeaders: string
  response: ArrayBuffer | string
  finalUrl: string
}

export interface GmRequestOptions {
  method?: 'GET' | 'POST' | 'HEAD'
  url: string
  headers?: Record<string, string>
  body?: string
  responseType?: 'arraybuffer' | 'text' | 'json'
  timeoutMs?: number
}

export function gmRequest({
  method = 'GET',
  url,
  headers,
  body,
  responseType = 'text',
  timeoutMs = 120_000,
}: GmRequestOptions): Promise<GmResponse> {
  if (typeof GM_xmlhttpRequest !== 'function') {
    return fetch(url, { method, headers, body, credentials: 'include' }).then(async (response) => {
      const responseTypeIsBuffer = responseType === 'arraybuffer'
      return {
        status: response.status,
        statusText: response.statusText,
        responseHeaders: [...response.headers.entries()]
          .map(([key, value]) => `${key}: ${value}`)
          .join('\r\n'),
        response: responseTypeIsBuffer ? await response.arrayBuffer() : await response.text(),
        finalUrl: response.url,
      }
    })
  }

  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method,
      url,
      headers,
      data: body,
      responseType,
      timeout: timeoutMs,
      onload: (response) => {
        resolve({
          status: response.status,
          statusText: response.statusText,
          responseHeaders: response.responseHeaders,
          response: response.response as ArrayBuffer | string,
          finalUrl: response.finalUrl,
        })
      },
      onerror: () => reject(new Error('gm-xhr-error')),
      ontimeout: () => reject(new Error('gm-xhr-timeout')),
      onabort: () => reject(new Error('gm-xhr-abort')),
    })
  })
}

export function parseResponseHeader(headers: string, name: string): string | null {
  const lower = name.toLowerCase()
  for (const line of headers.split(/\r?\n/)) {
    const index = line.indexOf(':')
    if (index === -1) continue
    if (line.slice(0, index).trim().toLowerCase() === lower) {
      return line.slice(index + 1).trim()
    }
  }
  return null
}

/**
 * Read a cookie for an arbitrary origin (e.g. m.weibo.cn) through the
 * manager's cookie API. Document cookies only cover the current origin.
 */
export async function gmCookieValue(url: string, name: string): Promise<string | null> {
  if (typeof GM_cookie !== 'undefined' && typeof GM_cookie.list === 'function') {
    return new Promise((resolve) => {
      try {
        GM_cookie.list({ url, name }, (cookies: Array<{ value?: string }>, error?: unknown) => {
          if (error || !cookies?.length) {
            resolve(null)
            return
          }
          resolve(cookies[0]?.value ?? null)
        })
      } catch {
        resolve(null)
      }
    })
  }

  // Fallback: same-origin cookies are readable from document.cookie.
  try {
    if (new URL(url).origin !== window.location.origin) return null
  } catch {
    return null
  }

  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunks: string[] = []
  const chunkSize = 0x8000

  for (let index = 0; index < bytes.length; index += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + chunkSize)))
  }

  return btoa(chunks.join(''))
}
