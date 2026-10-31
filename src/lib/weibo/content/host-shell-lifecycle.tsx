import { createRoot, type Root } from 'react-dom/client'

import { setUiPortalContainer } from '@/components/ui/portal'
import type { HomeTab } from '@/lib/app-settings'
import { bindAppSettingsStorageSync, getAppSettingsStore } from '@/lib/app-settings-store'
import { createShadowRootUi } from '@/lib/platform/shadow-ui'
import { AppRoot } from '@/lib/weibo/app/app-root'
import { waitForWeiboHostRegions } from '@/lib/weibo/content/host-selectors'
import { markWeiboPageReady } from '@/lib/weibo/content/page-takeover'
import { bindShellState } from '@/lib/weibo/content/shell-state'
import { loadFollowGroups } from '@/lib/weibo/data/weibo-data'
import { homeTimelinePathFromTab } from '@/lib/weibo/route/home-timeline-path'

interface MountedWeiboUi {
  root: Root
  cleanup: () => void
}

export function injectSonnerStyles(shadow: ShadowRoot, styles: string) {
  const existingStyle = shadow.querySelector('[data-sonner-styles]')
  if (existingStyle) return

  const style = document.createElement('style')
  style.setAttribute('data-sonner-styles', '')
  style.textContent = styles
  shadow.appendChild(style)
}

export function shouldRedirectInitialHomePage({
  firstLoadRedirect,
  historyLength,
  pathname,
}: {
  firstLoadRedirect: HomeTab
  historyLength: number
  pathname: string
}) {
  return (
    firstLoadRedirect !== 'for-you' && historyLength <= 2 && (pathname === '/' || pathname === '')
  )
}

export async function mountWeiboHostShell({
  styles,
  sonnerStyles = '',
}: {
  styles: string
  sonnerStyles?: string
}) {
  const regions = await waitForWeiboHostRegions(document)
  if (!regions) {
    markWeiboPageReady()
    return null
  }

  const settingsStore = getAppSettingsStore()
  const cleanupStorageSync = bindAppSettingsStorageSync(settingsStore)
  await settingsStore.getState().hydrate()

  // 首次加载跳转：当 window.history.length <= 2 且当前在首页时，重定向到用户选择的页面
  const { firstLoadRedirect } = settingsStore.getState()
  if (
    shouldRedirectInitialHomePage({
      firstLoadRedirect,
      historyLength: window.history.length,
      pathname: window.location.pathname,
    })
  ) {
    let redirectPath = homeTimelinePathFromTab(firstLoadRedirect)
    if (firstLoadRedirect === 'special-follow' || firstLoadRedirect === 'friend-circle') {
      try {
        const groups = await loadFollowGroups()
        redirectPath = homeTimelinePathFromTab(firstLoadRedirect, groups.defaultGroups)
      } catch {
        redirectPath = homeTimelinePathFromTab(firstLoadRedirect)
      }
    }
    cleanupStorageSync()
    window.location.replace(redirectPath)
    return null
  }

  const ui = createShadowRootUi({ name: 'xb-shell-userscript', styles })
  const { container, shadow } = ui

  injectSonnerStyles(shadow, sonnerStyles)
  setUiPortalContainer(container)

  const cleanupShellState = bindShellState({
    container,
    appRoot: regions.appRoot,
    settingsStore,
  })

  const root = createRoot(container)
  root.render(<AppRoot />)

  return {
    host: ui.host,
    container,
    root,
    cleanup() {
      cleanupStorageSync()
      cleanupShellState()
      setUiPortalContainer(null)
      root.unmount()
      ui.remove()
    },
  } satisfies MountedWeiboUi & { host: HTMLElement; container: HTMLElement }
}
