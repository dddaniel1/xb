<p align="center">
  <img src="./public/icon/rounded_image.png" alt="xb" width="96" />
</p>

<h1 align="center">xb · userscript</h1>

<p align="center">
  <strong>Redesign Weibo</strong>
</p>

<p align="center">like X but even better.</p>

<p align="right">
  <a href="./README.md">中文</a>
  ·
  <a href="https://github.com/dddaniel1/xb">this fork</a>
  ·
  <a href="https://github.com/nnecec/xb">upstream</a>
</p>

xb rewrites weibo.com into a focused, X-style reading experience: no ads, no
noise, no visual clutter.

This repository is the **Tampermonkey userscript version** of
[nnecec/xb](https://github.com/nnecec/xb). The UI, data layer and features are
the same; the build moved from WXT (Manifest V3 extension) to
[vite-plugin-monkey](https://github.com/lisonge/vite-plugin-monkey), producing a
single `xb.user.js` file.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) (Violentmonkey works
   too).
2. Open the install URL:
   <https://raw.githubusercontent.com/dddaniel1/xb/main/dist/xb.user.js>
   Tampermonkey will show the install page. Alternatively run
   `pnpm install && pnpm build` and drag `dist/xb.user.js` into the browser.
3. The header includes `@updateURL` / `@downloadURL`, so Tampermonkey checks this
   fork for new versions automatically.
4. Visit <https://weibo.com/>.

> The first time topic search or unread reminders run, Tampermonkey may ask for
> `GM_cookie` permission because the script reads the `m.weibo.cn` XSRF cookie.

## Features

1. ✨ **X-style layout** — clean, reading-first
2. 🔓 **Fully open source**
3. 🎯 **Focused feed** — no distractions
4. 🚫 **Less noise** — media and ads hidden by default
5. 🆓 **Free** — no paid tier
6. 📷 **Image export** — render posts as images with multiple card templates
7. 🔤 **Custom fonts** — system fonts and downloadable open-source fonts
8. 🎨 **Custom themes**
9. 📅 **Local browsing history**
10. ⬇️ **Media download** — single and batch downloads

Settings live in the xb panel at the bottom-right of the page.

## Development

Requires Node.js ≥ 20 and pnpm.

```bash
pnpm install
pnpm dev        # Vite dev server + userscript dev build (hot reload)
pnpm build      # dist/xb.user.js + dist/xb.meta.js
pnpm compile    # type check
pnpm test:unit  # Vitest
pnpm smoke      # jsdom smoke test against the built bundle
```

During `pnpm dev`, Tampermonkey installs a temporary `dev:` prefixed script
pointed at the Vite server. Reload weibo.com to pick up changes.

## Differences from the extension

| Capability     | Extension                           | Userscript                          |
| -------------- | ----------------------------------- | ----------------------------------- |
| Install        | Browser stores                      | Tampermonkey                        |
| Build          | WXT / Manifest V3                   | vite-plugin-monkey / Vite           |
| Settings       | `chrome.storage.local`              | `GM_getValue` / `GM_setValue`       |
| Weibo API      | page-context bridge + postMessage   | axios + `GM_xmlhttpRequest` adapter |
| Media download | background SW + DNR headers         | `GM_xmlhttpRequest` to the CDN      |
| m.weibo.cn     | background proxy + `chrome.cookies` | `GM_xmlhttpRequest` + `GM_cookie`   |
| Isolation      | extension Shadow Root               | native Shadow Root                  |
| Artifact       | extension zip                       | single `xb.user.js` (~7 MB)         |

## Credits

- Original author [nnecec](https://github.com/nnecec) and
  [xb](https://github.com/nnecec/xb)
- Inspired by [BewlyBewly](https://github.com/BewlyBewly/BewlyBewly) and
  [BewlyCat](https://github.com/keleus/BewlyCat)
