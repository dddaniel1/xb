import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'

import { getPageWindow } from '@/lib/platform/gm'
import { emitUnauthorized } from '@/lib/weibo/services/auth-events'

export type WeiboQueryParams = Record<string, string | number | null | undefined>

const DEFAULT_TIMEOUT_MS = 10000

function readXsrfTokenFromCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)
  if (!match?.[1]) return null

  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

function serializeParams(params?: WeiboQueryParams): string {
  if (!params) return ''
  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue
    search.append(key, String(value))
  }

  return search.toString()
}

function requestHeaders(config: InternalAxiosRequestConfig): Record<string, string> {
  const raw =
    typeof (config.headers as { toJSON?: unknown }).toJSON === 'function'
      ? (config.headers as unknown as { toJSON: () => Record<string, unknown> }).toJSON()
      : (config.headers as unknown as Record<string, unknown>)
  const headers: Record<string, string> = {}

  for (const [key, value] of Object.entries(raw ?? {})) {
    if (value == null) continue
    headers[key] = String(value)
  }

  return headers
}

function parseResponseData(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) return null

  try {
    return JSON.parse(trimmed)
  } catch {
    return text
  }
}

/**
 * Axios adapter that performs the request with the page's own `fetch`.
 *
 * This is the userscript replacement for the extension's page-context API
 * bridge. Weibo's login cookies are SameSite-protected: a GM_xmlhttpRequest is
 * cross-site from the manager's extension origin, so `SUB` is dropped and the
 * API answers 401/403 ("not logged in"). Calling `window.fetch` from the page
 * keeps the request same-origin, with the page's cookies and Referer.
 */
export async function pageFetchAdapter(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  const page = getPageWindow()
  const path = config.url ?? ''
  const url = new URL(
    /^https?:\/\//.test(path) ? path : `${config.baseURL ?? ''}${path}`,
    page.location.origin,
  )
  const query = serializeParams(config.params as WeiboQueryParams | undefined)
  if (query) url.search = query

  const method = (config.method ?? 'get').toUpperCase()
  const data =
    typeof config.data === 'string'
      ? config.data
      : config.data instanceof URLSearchParams
        ? config.data.toString()
        : config.data == null
          ? undefined
          : JSON.stringify(config.data)

  const controller = new AbortController()
  const timeoutMs = config.timeout || DEFAULT_TIMEOUT_MS
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await page.fetch(url.href, {
      method,
      headers: {
        ...requestHeaders(config),
        ...(data ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
      },
      body: data,
      credentials: 'include',
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }

  const text = await response.text()
  const axiosResponse: AxiosResponse = {
    data: parseResponseData(text),
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    config,
    request: null,
  }

  if (response.status === 401 || response.status === 403) {
    console.warn('[xb] Weibo API rejected the session:', response.status, url.href)
  }

  if (response.status < 200 || response.status >= 300) {
    throw new AxiosError(
      `Request failed with status code ${response.status}`,
      'ERR_BAD_RESPONSE',
      config,
      null,
      axiosResponse,
    )
  }

  return axiosResponse
}

/**
 * Weibo API client. All requests go through the page's own fetch; see
 * `pageFetchAdapter` for why GM_xmlhttpRequest cannot be used here.
 */
export const weiboHttp = axios.create({
  baseURL: '',
  timeout: DEFAULT_TIMEOUT_MS,
  withCredentials: true,
  adapter: pageFetchAdapter,
  headers: {
    Accept: 'application/json, text/plain, */*',
    'X-Requested-With': 'XMLHttpRequest',
  },
})

export async function wbGet<T>(path: string, params: WeiboQueryParams = {}): Promise<T> {
  try {
    const response = await weiboHttp.get<T>(path, { params })
    return response.data
  } catch (error) {
    throw normalizeWeiboError(error)
  }
}

export async function wbPostForm<T>(path: string, data: Record<string, string>): Promise<T> {
  const xsrf = readXsrfTokenFromCookie()

  try {
    const response = await weiboHttp.post<T>(path, new URLSearchParams(data), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(xsrf ? { 'X-XSRF-TOKEN': xsrf } : {}),
      },
    })
    return response.data
  } catch (error) {
    throw normalizeWeiboError(error)
  }
}

function normalizeWeiboError(error: unknown): Error {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status
    if (status === 401 || status === 403) {
      emitUnauthorized()
    }

    const payload = error.response?.data as { message?: string; msg?: string } | undefined
    return new Error(payload?.message || payload?.msg || error.message)
  }

  return error instanceof Error ? error : new Error('weibo-request-failed')
}
