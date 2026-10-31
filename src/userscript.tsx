import { getPageWindow, installBrowserApi } from '@/lib/platform/browser-api'
import { mountWeiboHostShell } from '@/lib/weibo/content/host-shell-lifecycle'
import { installHistoryBridge } from '@/lib/weibo/inject/install-history-bridge'

import appStyles from '@/assets/global.css?inline'
import videoPlayerStyles from '@/lib/weibo/components/media-player/video-player.css?inline'
import antiFlashStyles from '@/lib/weibo/content/weibo-anti-flash.css?inline'
import audioSkinStyles from '@videojs/react/audio/skin.css?inline'
import videoSkinStyles from '@videojs/react/video/skin.css?inline'
import photoViewStyles from 'react-photo-view/dist/react-photo-view.css?inline'
import sonnerStyles from 'sonner/dist/styles.css?raw'

interface XbBootWindow extends Window {
  __xbUserscriptBooted?: boolean
}

const page = getPageWindow() as XbBootWindow

function injectAntiFlashStyle() {
  const style = document.createElement('style')
  style.setAttribute('data-xb-anti-flash', '')
  style.textContent = antiFlashStyles
  document.documentElement.appendChild(style)
  return style
}

/**
 * Tailwind v4 registers its `--tw-*` defaults through `@property`. Chrome
 * ignores `@property` rules inside shadow-root stylesheets, so utilities such
 * as `-translate-y-20` silently compute to `none`. Register the properties in
 * the document instead; registrations are global and the shadow CSS still uses
 * them.
 */
function injectPropertyRegistrations(css: string) {
  const rules = css.match(/@property[^{]+\{[^}]*\}/g)
  if (!rules?.length) return

  const style = document.createElement('style')
  style.setAttribute('data-xb-property-registrations', '')
  style.textContent = rules.join('\n')
  ;(document.head ?? document.documentElement).appendChild(style)
}

/**
 * Hide shells left by older copies of this script (or by the browser
 * extension). They cannot be removed from here, but they must not add a second
 * full-height blank block or fight the current mount for `#app`.
 */
function hideForeignShells() {
  const style = document.createElement('style')
  style.setAttribute('data-xb-isolation', '')
  style.textContent = 'xb-shell:not([data-xb-userscript]){display:none!important}'
  ;(document.head ?? document.documentElement).appendChild(style)
}

async function start(antiFlashStyle: HTMLStyleElement) {
  const styles = [
    appStyles,
    photoViewStyles,
    audioSkinStyles,
    videoSkinStyles,
    videoPlayerStyles,
  ].join('\n')

  try {
    await mountWeiboHostShell({ styles, sonnerStyles })
  } finally {
    // The app is mounted (or mounting failed); never leave the native page
    // hidden behind a failed boot.
    antiFlashStyle.remove()
  }
}

function boot() {
  // 1. GM_* -> browser.* shim. Must run before the app modules touch storage.
  installBrowserApi()
  injectPropertyRegistrations(appStyles)
  hideForeignShells()

  // 2. Hide Weibo's native shell while React boots. The rule is keyed on
  //    `data-xb-weibo-ready`, which shell-state sets after the first paint.
  const antiFlashStyle = injectAntiFlashStyle()

  // 3. Weibo's own SPA router rewrites URLs after popstate; block that briefly
  //    so React Router sees the URL the user navigated to.
  installHistoryBridge(getPageWindow())

  void start(antiFlashStyle)
}

// A page can end up with more than one copy of the script (an old version left
// enabled in the manager, or the same userscript installed twice). Only the
// first copy may mount: two React roots race, and one of the hosts can be left
// empty or blank.
if (!page.__xbUserscriptBooted) {
  page.__xbUserscriptBooted = true
  boot()
}
