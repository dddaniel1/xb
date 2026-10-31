export interface ShadowRootUi {
  host: HTMLElement
  shadow: ShadowRoot
  container: HTMLElement
  remove: () => void
}

const HOST_STYLE = [
  'display: block',
  'position: relative',
  'z-index: 2147483646',
  'width: 100%',
  'min-height: 100vh',
  'isolation: isolate',
].join(';')

/**
 * Replacement for WXT's `createShadowRootUi`.
 *
 * Weibo ships a global stylesheet that fights every third-party UI, and the
 * redesign relies on Tailwind's preflight, so the whole app lives in a shadow
 * root. The stylesheet is passed in as a compiled string because Vite's normal
 * CSS pipeline would attach it to `document.head` instead.
 */
export function createShadowRootUi({
  name,
  styles,
  anchor = document.body,
}: {
  name: string
  styles: string
  anchor?: HTMLElement
}): ShadowRootUi {
  const host = document.createElement(name)
  host.setAttribute('data-xb-shell', '')
  host.setAttribute('data-xb-userscript', '')
  host.style.cssText = HOST_STYLE

  const shadow = host.attachShadow({ mode: 'open' })

  const styleElement = document.createElement('style')
  styleElement.setAttribute('data-xb-styles', '')
  styleElement.textContent = styles
  shadow.appendChild(styleElement)

  const container = document.createElement('div')
  container.className = 'xb-app-root'
  container.style.cssText = 'display:block;min-height:100vh;'
  shadow.appendChild(container)

  anchor.insertBefore(host, anchor.firstChild)

  return {
    host,
    shadow,
    container,
    remove() {
      host.remove()
    },
  }
}
