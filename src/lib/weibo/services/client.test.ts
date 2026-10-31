import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { onUnauthorized } from './auth-events'
import { pageFetchAdapter, wbGet, wbPostForm, weiboHttp } from './client'

function respondWith(handler: (config: InternalAxiosRequestConfig) => unknown) {
  const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => ({
    data: handler(config),
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  }))

  weiboHttp.defaults.adapter = adapter
  return adapter
}

function rejectWith(status: number, message: string) {
  weiboHttp.defaults.adapter = async (config) => {
    throw new AxiosError(
      message,
      'ERR_BAD_RESPONSE',
      config,
      undefined,
      // minimal AxiosResponse
      {
        data: { message },
        status,
        statusText: message,
        headers: {},
        config,
      } as never,
    )
  }
}

afterEach(() => {
  weiboHttp.defaults.adapter = undefined
  vi.restoreAllMocks()
})

describe('page fetch adapter', () => {
  it('sends same-origin requests through the page fetch with cookies', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: 1 }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    weiboHttp.defaults.adapter = pageFetchAdapter

    await expect(wbGet('/ajax/test', { page: 1 })).resolves.toEqual({ ok: 1 })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(new URL(url).pathname).toBe('/ajax/test')
    expect(new URL(url).search).toBe('?page=1')
    expect(init.credentials).toBe('include')
    expect(init.headers).toMatchObject({ 'X-Requested-With': 'XMLHttpRequest' })

    vi.unstubAllGlobals()
  })

  it('posts form bodies from the page context', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: 1 }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    weiboHttp.defaults.adapter = pageFetchAdapter

    await expect(wbPostForm('/ajax/create', { content: 'hi' })).resolves.toEqual({ ok: 1 })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(new URL(url).pathname).toBe('/ajax/create')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('content=hi')

    vi.unstubAllGlobals()
  })
})

describe('client', () => {
  describe('wbGet', () => {
    it('requests the relative API path with params', async () => {
      const adapter = respondWith(() => ({ result: 'success' }))

      await expect(wbGet('/api/test', { page: 1 })).resolves.toEqual({ result: 'success' })

      expect(adapter).toHaveBeenCalledTimes(1)
      expect(adapter.mock.calls[0]![0].url).toBe('/api/test')
      expect(adapter.mock.calls[0]![0].params).toEqual({ page: 1 })
    })

    it('resolves with response data', async () => {
      respondWith(() => ({ result: 'success' }))
      await expect(wbGet('/api/test')).resolves.toEqual({ result: 'success' })
    })

    it('rejects with the API error message', async () => {
      rejectWith(404, 'Not found')
      await expect(wbGet('/api/test')).rejects.toThrow('Not found')
    })
  })

  describe('wbPostForm', () => {
    it('sends form-encoded bodies', async () => {
      const adapter = respondWith(() => ({ ok: 1 }))

      await expect(wbPostForm('/api/submit', { content: 'test' })).resolves.toEqual({ ok: 1 })

      const config = adapter.mock.calls[0]![0]
      expect(config.url).toBe('/api/submit')
      expect(String(config.data)).toBe('content=test')
    })

    it('emits unauthorized for 401/403 responses', async () => {
      const onAuthError = vi.fn()
      const unsubscribe = onUnauthorized(onAuthError)

      rejectWith(401, 'Unauthorized')
      await expect(wbPostForm('/api/submit', { content: 'test' })).rejects.toThrow('Unauthorized')
      expect(onAuthError).toHaveBeenCalledTimes(1)

      unsubscribe()
    })

    it('does not emit unauthorized for other errors', async () => {
      const onAuthError = vi.fn()
      const unsubscribe = onUnauthorized(onAuthError)

      rejectWith(500, 'Server error')
      await expect(wbPostForm('/api/submit', { content: 'test' })).rejects.toThrow('Server error')
      expect(onAuthError).not.toHaveBeenCalled()

      unsubscribe()
    })
  })
})
