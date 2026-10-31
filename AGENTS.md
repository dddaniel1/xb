# AGENTS.md

文档地图：`AGENTS.md`（本文，HOW）· `PRODUCT.md`（产品边界）· `DESIGN.md` /
`DESIGN.json`（UI 规则与 token）· `README.md` / `README.en.md`（面向用户）·
`src/lib/app-settings.ts`（设置项默认值）

## Project Overview

xb is a Tampermonkey userscript that rewrites weibo.com into a cleaner X-like
reading experience. Built with vite-plugin-monkey, React 19, TypeScript, Tailwind CSS 4, shadcn/ui,
videojs(more use infos: https://videojs.org/docs/framework/react/llms.txt)
motion (same as framer-motion), Zustand, TanStack Query, and `@reactuses/core`.

## Developer Commands

```bash
pnpm dev        # Vite dev server + userscript dev build (auto-install prompt)
pnpm build      # dist/xb.user.js + dist/xb.meta.js
pnpm build:cr   # Greasy Fork self-extracting dist/xb.cr.user.js
pnpm test:unit  # Run unit tests (Vitest + jsdom)
pnpm test:watch # Run tests in watch mode
pnpm compile    # TypeScript type check only
pnpm lint:check       # Format + lint with oxfmt/oxlint
pnpm smoke      # Load the built userscript in jsdom
```

- 包管理器使用 **pnpm**（`pnpm-lock.yaml`）

## Verification Order

lint → typecheck → test → build → smoke

## Project Structure

```
src/
├── userscript.tsx      # Tampermonkey entry (GM shim, anti-flash, history bridge, mount)
├── lib/
│   ├── platform/       # GM_* wrappers, browser.* shim, shadow UI, media/m.weibo proxy
│   ├── app-settings.ts / app-settings-store.ts
│   ├── custom-theme.ts / font-loader.ts / utils.ts
│   └── weibo/
│       ├── app/          # shell, root, layout
│       ├── components/   # feed, profile, gen-image, media-player, …
│       ├── content/      # host selectors, shell state, page takeover, lifecycle
│       ├── hooks/ pages/ route/ inject/ platform/ stores/ utils/
│       ├── data/         # weibo-data (public IO + query options), weibo-io (private)
│       ├── services/     # client, adapters, m-weibo-client, endpoints
│       ├── models/ queries/
├── components/ui/     # shadcn
├── hooks/
└── test/
```

## Architecture Notes

- **Entry**: `userscript.tsx` installs the GM shim, injects the anti-flash rule
  at `document-start`, patches history, then mounts React.
- **Shadow UI**: `lib/platform/shadow-ui.ts` — native `attachShadow`; the
  compiled Tailwind bundle is injected as a string (Vite's normal CSS pipeline
  would attach to `document.head`).
- _*browser.* shim_*: `lib/platform/browser-api.ts` implements the small
  WebExtension surface the app uses on top of `GM_getValue` / `GM_setValue` /
  `GM_xmlhttpRequest` / `GM_cookie`.
- **API**: `services/client.ts` uses an axios `GM_xmlhttpRequest` adapter, so
  Weibo requests carry page cookies without CORS issues.
- **Settings Store**: `app-settings-store.ts` → `browser.storage` shim; call
  `hydrate()` before use.
- **Host Shell Lifecycle**: `host-shell-lifecycle.tsx` — inject bridge, wait for
  host DOM, hydrate, first-load redirect, mount UI, cleanup.
- **Data Layer**: `data/weibo-data.ts` is the **only** public Weibo IO seam
  (load*/mutations + TanStack Query options). Private impl: `data/weibo-io.ts`
  → `client.ts` / `m-weibo-client` + `adapters/` + `utils/transform/`.
  UI and pages must not import `weibo-io` or `services/adapters` directly.
- **Status Cache**: `queries/status-cache.ts` — optimistic like/favorite/comment
  count across timeline/detail/comment caches.
- **xb Rating**: `rating/xb-rating.ts` (hooks + signed server client).

## Key Patterns

- **Hooks**: Prefer `@reactuses/core` over reimplementing common hooks.
- **Routing**: `parse-weibo-url.ts` → `page-descriptor.ts` (home, profile,
  follows, favorites, liked, notifications, explore, history, topics).
- **Mounting**: `host-selectors.ts` waits for DOM; `shell-state.ts` binds to
  host; `page-takeover.ts` marks handled pages.
- **m.weibo.cn**: `platform/weibo-services.ts` proxies topic/search through
  `GM_xmlhttpRequest` + `GM_cookie` when the desktop API is weak.
- **Media**: `download-media.ts` + `jszip` for batch; **themes**:
  `custom-theme.ts` → CSS variables via `shell-state.ts`.

## Code Patterns

### Settings

`useAppSettings` 选择性订阅；开关与默认值以 `app-settings.ts` 为准。

```typescript
const fontSizeClass = useAppSettings((s) => s.fontSizeClass)
const setFontSizeClass = useAppSettings((s) => s.setFontSizeClass)
```

### Mutations

- 跨页面乐观更新 → `status-cache.ts`
- 仅刷新查询 → mutation `meta.invalidates`

```typescript
const followMutation = useMutation({
  mutationFn: () => followUser(uid),
  meta: {
    invalidates: [
      ['weibo', 'profile'],
      ['weibo', 'profile-hover'],
    ],
  },
})
```

### Shared UI

- Profile 共享：`profile-shared.tsx`（`ProfileBanner`、`ProfileMutualFollowers`、`formatProfileCount`）
- 产品范围与 UI 原则：见 `PRODUCT.md`、`DESIGN.md`；评分/env 见下文 Extension
  Notes

## Testing

- Vitest + `jsdom`; setup: `src/test/setup.ts`
- Tests: `*.test.ts` / `*.spec.ts` alongside source; components use
  `@testing-library/react`

## Code Quality

- **Linter**: oxlint (strict, TS/React/unicorn)
- **Formatter**: oxfmt (no semicolons, single quotes, sorted imports)
- **TypeScript**: standalone `tsconfig.json`; `@/*` maps to `src/*`

## Userscript Notes

- Metadata (`@match`, `@grant`, `@connect`, `@run-at`) is generated by
  `vite-plugin-monkey` from `vite.config.ts`.
- `@grant` must match the globals used in `lib/platform/`: `GM_getValue`,
  `GM_setValue`, `GM_deleteValue`, `GM_listValues`, value-change listeners,
  `GM_xmlhttpRequest`, `GM_cookie`, and the page-window grant.
- Only `https://weibo.com/*` and `https://www.weibo.com/*` are matched. The
  old `s.weibo.com` content script was disabled upstream.
- The GitHub build is ~3.5 MB minified (React + video.js + dash.js); SystemJS
  is inlined so there are no `@require` dependencies.
- Greasy Fork caps scripts at 2 MiB and forbids minified code. `scripts/build-compressed.mjs`
  gzips the full bundle into `dist/xb.cr.gf.user.js` (base64 + `DecompressionStream`),
  which is the artifact published at <https://greasyfork.org/zh-CN/scripts/603092-xb>.
- Rating build env: `XB_SIGN_SECRET` / `VITE_XB_SIGN_SECRET`; optional
  `XB_SERVER_URL`. These signing secrets are bundled into the script and should
  be treated as compatibility-only, not as a real security boundary.
