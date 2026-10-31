import {
  gmAddValueChangeListener,
  gmCookieValue,
  gmDeleteValue,
  gmGetValue,
  gmListValues,
  gmRemoveValueChangeListener,
  gmSetValue,
} from './gm'

export { getPageWindow } from './gm'
import { handleMediaFetch, handleMediaHead, handleMweiboFetch } from './weibo-services'

type StorageChange = { oldValue?: unknown; newValue?: unknown }
type StorageChangeListener = (changes: Record<string, StorageChange>, areaName: string) => void

const changeListeners = new Set<StorageChangeListener>()

function emitStorageChanges(changes: Record<string, StorageChange>) {
  for (const listener of changeListeners) {
    try {
      listener(changes, 'local')
    } catch (error) {
      console.warn('[xb] storage change listener failed', error)
    }
  }
}

function normalizeKeys(keys?: string | string[] | Record<string, unknown> | null) {
  if (keys == null) return gmListValues()
  if (typeof keys === 'string') return [keys]
  if (Array.isArray(keys)) return keys
  return Object.keys(keys)
}

const storageArea = {
  async get(keys?: string | string[] | Record<string, unknown> | null) {
    const result: Record<string, unknown> = {}

    if (keys && !Array.isArray(keys) && typeof keys === 'object') {
      for (const [key, fallback] of Object.entries(keys)) {
        result[key] = gmGetValue(key, fallback)
      }
      return result
    }

    for (const key of normalizeKeys(keys)) {
      const value = gmGetValue(key)
      if (value !== undefined) result[key] = value
    }
    return result
  },

  async set(items: Record<string, unknown>) {
    const changes: Record<string, StorageChange> = {}

    for (const [key, newValue] of Object.entries(items)) {
      const oldValue = gmGetValue(key)
      gmSetValue(key, newValue)
      changes[key] = { oldValue, newValue }
    }

    emitStorageChanges(changes)
  },

  async remove(keys: string | string[]) {
    const list = Array.isArray(keys) ? keys : [keys]
    const changes: Record<string, StorageChange> = {}

    for (const key of list) {
      const oldValue = gmGetValue(key)
      if (oldValue === undefined) continue
      gmDeleteValue(key)
      changes[key] = { oldValue, newValue: undefined }
    }

    if (Object.keys(changes).length > 0) emitStorageChanges(changes)
  },

  async clear() {
    const list = gmListValues()
    const changes = Object.fromEntries(list.map((key) => [key, { oldValue: gmGetValue(key) }]))
    for (const key of list) gmDeleteValue(key)
    if (list.length > 0) emitStorageChanges(changes)
  },
}

const storageOnChanged = {
  addListener(listener: StorageChangeListener) {
    changeListeners.add(listener)
  },
  removeListener(listener: StorageChangeListener) {
    changeListeners.delete(listener)
  },
}

async function dispatchMessage(message: unknown): Promise<unknown> {
  const type = (message as { type?: string } | null)?.type
  const url = (message as { url?: string } | null)?.url

  switch (type) {
    case 'mweibo-ping':
      return undefined
    case 'mweibo-fetch':
      if (!url) return { ok: false, error: 'missing-url' }
      return handleMweiboFetch(url)
    case 'media-head':
      if (!url) return { ok: false, error: 'missing-url' }
      return handleMediaHead(url)
    case 'media-fetch':
      if (!url) return { ok: false, error: 'missing-url' }
      return handleMediaFetch(url)
    default:
      return undefined
  }
}

const runtime = {
  sendMessage(message: unknown): Promise<unknown> {
    return dispatchMessage(message)
  },
  getManifest() {
    return { version: __XB_VERSION__ }
  },
  getURL(path: string) {
    return path
  },
  onMessage: {
    addListener() {},
    removeListener() {},
  },
}

const cookies = {
  async get(details: { url: string; name: string }) {
    const value = await gmCookieValue(details.url, details.name)
    return value == null ? null : { name: details.name, value }
  },
}

const browserApi = {
  __xbUserscript: true,
  storage: {
    local: storageArea,
    onChanged: storageOnChanged,
  },
  runtime,
  cookies,
}

const SYNCED_STORAGE_KEYS = [
  'xb:app-settings',
  'xb:weibo-recent-emoticons',
  'xb:weibo-video-volume',
  'xb:browsing-history',
]

let installed = false
let remoteListenerIds: Array<string | number> = []

/**
 * Install a `browser.*` compatible API in front of `GM_*`.
 *
 * The app was originally a WebExtension. Keeping the call sites untouched
 * (settings storage, download proxy, m.weibo.cn proxy) means the UI layer did
 * not need to be rewritten for the userscript.
 */
export function installBrowserApi() {
  if (installed) return
  installed = true

  const target = globalThis as { browser?: unknown }
  if (!(target.browser as { __xbUserscript?: boolean } | undefined)?.__xbUserscript) {
    Object.defineProperty(globalThis, 'browser', {
      configurable: true,
      writable: true,
      value: browserApi,
    })
  }

  remoteListenerIds = SYNCED_STORAGE_KEYS.map((key) =>
    gmAddValueChangeListener(key, (name, oldValue, newValue, remote) => {
      if (!remote) return
      emitStorageChanges({ [name]: { oldValue, newValue } })
    }),
  ).filter((id): id is string | number => id != null)
}

export function uninstallBrowserApi() {
  for (const id of remoteListenerIds) gmRemoveValueChangeListener(id)
  remoteListenerIds = []
  changeListeners.clear()
  installed = false
}

export { browserApi }
