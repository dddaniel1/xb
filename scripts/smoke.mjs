/**
 * Headless smoke test for the built userscript.
 *
 * Loads dist/xb.user.js into a jsdom page that looks enough like weibo.com to
 * exercise the real entry path: GM shims -> settings hydration -> shadow root
 * mount -> React render. It is not a substitute for a logged-in browser, but it
 * catches bundling and runtime wiring regressions.
 *
 *   node scripts/smoke.mjs
 */
import { readFileSync } from 'node:fs'

import { JSDOM } from 'jsdom'

const bundle = readFileSync(new URL('../dist/xb.user.js', import.meta.url), 'utf8')

const dom = new JSDOM(
  `<!doctype html><html><head></head><body>
    <div id="app"><div data-testid="mainCore"><div id="pl_feedlist_index"></div></div></div>
  </body></html>`,
  {
    url: 'https://weibo.com/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  },
)

const { window } = dom
const { document } = window

// ── browser APIs jsdom does not implement ──
window.matchMedia = (query) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {
    return false
  },
})

class StubObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}
window.ResizeObserver = StubObserver
window.IntersectionObserver = StubObserver
window.scrollTo = () => {}
window.Element.prototype.scrollIntoView = () => {}
window.Element.prototype.animate = () => ({
  finished: Promise.resolve(),
  cancel() {},
  play() {},
  pause() {},
  addEventListener() {},
  removeEventListener() {},
})

// ── userscript manager shims ──
const store = new Map()
const pageWindowName = ['unsafe', 'Window'].join('')
window[pageWindowName] = window
window.GM_getValue = (key, fallback) => (store.has(key) ? store.get(key) : fallback)
window.GM_setValue = (key, value) => {
  store.set(key, value)
}
window.GM_deleteValue = (key) => {
  store.delete(key)
}
window.GM_listValues = () => [...store.keys()]
window.GM_addValueChangeListener = () => 1
window.GM_removeValueChangeListener = () => {}
window.GM_cookie = { list: (_details, callback) => callback([], null) }
window.GM_registerMenuCommand = () => 1
window.GM_xmlhttpRequest = (details) => {
  setTimeout(() => {
    details.onload?.({
      status: 200,
      statusText: 'OK',
      responseHeaders: 'content-type: application/json',
      response: JSON.stringify({ ok: 1, data: {} }),
      finalUrl: details.url,
    })
  })
}

// Keep the app's queries resolvable without touching the network. The app
// tolerates HTTP failures, but a resolved empty payload keeps the smoke run
// focused on mounting and rendering.
window.fetch = async () =>
  new Response(JSON.stringify({ ok: 1, data: {}, statuses: [], cards: [] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

// jsdom + React Query can report late rejections after the assertions run.
process.on('unhandledRejection', () => {})

const errors = []
window.addEventListener('error', (event) => errors.push(event.error ?? event.message))
window.addEventListener('unhandledrejection', (event) => errors.push(event.reason))

// Suppress noisy React Query retries during the smoke run.
window.console.error = (...args) => {
  const text = args.map(String).join(' ')
  if (text.includes('smoke-test-network-disabled')) return
  console.error(...args)
}

window.eval(bundle)

await new Promise((resolve) => setTimeout(resolve, 1500))

const host = document.querySelector('xb-shell-userscript')
const shadow = host?.shadowRoot
const appRoot = shadow?.querySelector('.xb-app-root')
const styleCount = shadow?.querySelectorAll('style').length ?? 0
const styleBytes = [...(shadow?.querySelectorAll('style') ?? [])].map(
  (node) => node.textContent.length,
)
const appCss = [...(shadow?.querySelectorAll('style') ?? [])]
  .map((node) => node.textContent)
  .join('\n')
const hasTailwindUtilities = appCss.includes('.flex{') || appCss.includes('.flex {')

console.log(
  JSON.stringify(
    {
      hostMounted: Boolean(host),
      shadowRoot: Boolean(shadow),
      styleCount,
      styleBytes,
      hasTailwindUtilities,
      hasVariables: appCss.includes(':host') && appCss.includes('--background'),
      appRootChildren: appRoot?.children.length ?? 0,
      pageReady: document.documentElement.hasAttribute('data-xb-weibo-ready'),
      nativePageHidden: document.querySelector('#app')?.style.display === 'none',
      bodyText: (appRoot?.textContent ?? '').replace(/\s+/g, ' ').slice(0, 120),
      errors: errors.map((error) => String(error)),
    },
    null,
    2,
  ),
)

process.exit(host && shadow && appRoot && appRoot.children.length > 0 ? 0 : 1)
