import { getPageWindow } from '@/lib/platform/gm'

let cachedUid: string | null = null

interface WeiboPageConfig {
  uid?: number | string
  user?: { id?: number | string; idstr?: string }
}

export function getCurrentUserUid(): string | null {
  if (cachedUid) return cachedUid

  // Weibo exposes the logged-in account in `$CONFIG` before the native shell
  // (including the tab nav) finishes rendering. The app mounts as soon as
  // `#app` exists and hides that shell, so the nav-based fallback below is not
  // always available at render time.
  const config = (getPageWindow() as Window & { $CONFIG?: WeiboPageConfig }).$CONFIG
  const configUid = config?.uid ?? config?.user?.idstr ?? config?.user?.id
  if (configUid != null && String(configUid) !== '' && String(configUid) !== '0') {
    cachedUid = String(configUid)
    return cachedUid
  }

  const tabNav = document.querySelector('.woo-box-flex.woo-tab-nav.woo-tab-nav')
  if (!tabNav) return null

  const fifthChild = tabNav.children[4]
  if (!fifthChild) return null

  const anchor =
    fifthChild.tagName === 'A' ? (fifthChild as HTMLAnchorElement) : fifthChild.querySelector('a')
  if (!anchor) return null

  const href = anchor.getAttribute('href')
  if (!href) return null

  const match = href.match(/\/u\/(\d+)/)
  cachedUid = match?.[1] ?? null
  return cachedUid
}
