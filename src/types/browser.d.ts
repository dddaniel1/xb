export interface BrowserStorageChange {
  oldValue?: unknown
  newValue?: unknown
}

export type BrowserStorageChangeListener = (
  changes: Record<string, BrowserStorageChange>,
  areaName: string,
) => void

export interface BrowserStorageArea {
  get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
  remove(keys: string | string[]): Promise<void>
  clear(): Promise<void>
}

export interface BrowserStorageOnChanged {
  addListener(listener: BrowserStorageChangeListener): void
  removeListener(listener: BrowserStorageChangeListener): void
}

export interface BrowserRuntime {
  sendMessage(message: unknown): Promise<unknown>
  getManifest(): { version: string }
  getURL(path: string): string
  onMessage: {
    addListener(listener: (message: unknown) => unknown): void
    removeListener(listener: (message: unknown) => unknown): void
  }
}

export interface BrowserApi {
  storage: {
    local: BrowserStorageArea
    onChanged: BrowserStorageOnChanged
  }
  runtime: BrowserRuntime
  cookies: {
    get(details: { url: string; name: string }): Promise<{ name: string; value: string } | null>
  }
}

declare global {
  // The extension build used the WebExtension `browser` namespace. The
  // userscript provides a GM_*-backed implementation of the same shape.
  // eslint-disable-next-line no-var
  var browser: BrowserApi

  // Injected by Vite `define`.
  // eslint-disable-next-line no-var
  var __XB_VERSION__: string
}
