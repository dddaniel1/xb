import type { MweiboFetchResponse } from '@/lib/weibo/platform/messages'

import { arrayBufferToBase64, gmCookieValue, gmRequest, parseResponseHeader } from './gm'

// ─── m.weibo.cn fetch ───

export function assertAllowedMweiboFetchUrl(url: string): void {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'm.weibo.cn') {
    throw new Error('unsupported-mweibo-url')
  }

  const allowed =
    parsed.pathname === '/api/remind/unread' ||
    (parsed.pathname === '/api/container/getIndex' &&
      parsed.searchParams.get('page_type') === 'searchall')

  if (!allowed) {
    throw new Error('unsupported-mweibo-endpoint')
  }
}

function getResponseContentType(headers: string): string | undefined {
  return parseResponseHeader(headers, 'content-type')?.split(';', 1)[0]?.trim().toLowerCase()
}

export async function handleMweiboFetch(url: string): Promise<MweiboFetchResponse> {
  assertAllowedMweiboFetchUrl(url)

  const xsrfToken = await gmCookieValue('https://m.weibo.cn', 'XSRF-TOKEN')
  const headers: Record<string, string> = {
    'x-requested-with': 'XMLHttpRequest',
    accept: 'application/json, text/plain, */*',
    ...(xsrfToken ? { 'x-xsrf-token': xsrfToken } : {}),
  }

  let response
  try {
    response = await gmRequest({ url, headers, responseType: 'text' })
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'mweibo-fetch-failed',
    }
  }

  const contentType = getResponseContentType(response.responseHeaders)

  if (response.status < 200 || response.status >= 300) {
    return {
      ok: false,
      error: `mweibo-fetch-failed:${response.status}`,
      status: response.status,
      contentType,
    }
  }

  if (contentType === 'text/html' || contentType === 'application/xhtml+xml') {
    return {
      ok: false,
      error: 'mweibo-fetch-unexpected-content',
      status: response.status,
      contentType,
    }
  }

  try {
    const data = JSON.parse(String(response.response)) as unknown
    return { ok: true, data, status: response.status, contentType }
  } catch {
    return {
      ok: false,
      error: 'mweibo-fetch-unexpected-content',
      status: response.status,
      contentType,
    }
  }
}

// ─── media fetch proxy ───

export interface MediaHeadResponse {
  ok: boolean
  size?: number
  error?: string
}

export interface MediaFetchResponse {
  ok: boolean
  data?: string
  contentType?: string
  error?: string
}

const allowedMediaHostSuffixes = ['sinaimg.cn', 'sinajs.cn', 'weibocdn.com']
export const maxBackgroundMediaBytes = 150 * 1024 * 1024

function isAllowedMediaHost(hostname: string): boolean {
  return allowedMediaHostSuffixes.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
  )
}

export function assertAllowedMediaUrl(url: string): void {
  const parsed = new URL(url)

  if (parsed.protocol !== 'https:') {
    throw new Error('unsupported-media-url')
  }

  if (!isAllowedMediaHost(parsed.hostname)) {
    throw new Error('unsupported-media-host')
  }
}

/** Weibo's CDN rejects hotlinks, so present Weibo as the referer. */
function mediaHeaders(): Record<string, string> {
  return {
    accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,video/*',
    referer: 'https://weibo.com/',
  }
}

function isMediaContentType(contentType: string | undefined): contentType is string {
  return (
    contentType?.startsWith('image/') === true ||
    contentType?.startsWith('video/') === true ||
    contentType === 'application/octet-stream'
  )
}

function getResponseContentLength(headers: string): number | null {
  const value = parseResponseHeader(headers, 'content-length')
  if (!value) return null

  const size = Number.parseInt(value, 10)
  return Number.isFinite(size) && size >= 0 ? size : null
}

export async function handleMediaHead(url: string): Promise<MediaHeadResponse> {
  try {
    assertAllowedMediaUrl(url)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'unsupported-media-url' }
  }

  let response
  try {
    response = await gmRequest({
      method: 'HEAD',
      url,
      headers: mediaHeaders(),
      timeoutMs: 30_000,
    })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'media-head-failed' }
  }

  if (response.status < 200 || response.status >= 400) {
    return { ok: false, error: `media-head-failed:${response.status}` }
  }

  const contentType = getResponseContentType(response.responseHeaders)
  if (!isMediaContentType(contentType)) {
    return { ok: false, error: 'unsupported-media-content-type' }
  }

  return {
    ok: true,
    size: getResponseContentLength(response.responseHeaders) ?? 0,
  }
}

export async function handleMediaFetch(url: string): Promise<MediaFetchResponse> {
  try {
    assertAllowedMediaUrl(url)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'unsupported-media-url' }
  }

  let response
  try {
    response = await gmRequest({
      url,
      headers: mediaHeaders(),
      responseType: 'arraybuffer',
    })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'media-fetch-failed' }
  }

  if (response.status < 200 || response.status >= 300) {
    return { ok: false, error: `media-fetch-failed:${response.status}` }
  }

  const contentType = getResponseContentType(response.responseHeaders)
  if (!isMediaContentType(contentType)) {
    return { ok: false, error: 'unsupported-media-content-type' }
  }

  const declaredLength = getResponseContentLength(response.responseHeaders)
  if (declaredLength !== null && declaredLength > maxBackgroundMediaBytes) {
    return { ok: false, error: 'media-fetch-too-large' }
  }

  const buffer = response.response as ArrayBuffer
  if (buffer.byteLength > maxBackgroundMediaBytes) {
    return { ok: false, error: 'media-fetch-too-large' }
  }

  return {
    ok: true,
    data: arrayBufferToBase64(buffer),
    contentType,
  }
}
