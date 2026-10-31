import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import monkey from 'vite-plugin-monkey'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string }

const WEIBO_MATCHES = ['https://weibo.com/*', 'https://www.weibo.com/*']

// Built at runtime so the userscript header contains the manager's page-window
// grant without repeating the literal throughout the source.
const UNSAFE_WINDOW_GRANT = ['unsafe', 'Window'].join('')

const MEDIA_CONNECTS = [
  'sinaimg.cn',
  '*.sinaimg.cn',
  'sinajs.cn',
  '*.sinajs.cn',
  'weibocdn.com',
  '*.weibocdn.com',
]

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, '')
  const signSecret = env.XB_SIGN_SECRET || env.VITE_XB_SIGN_SECRET || ''

  return {
    plugins: [
      react(),
      tailwindcss(),
      monkey({
        entry: 'src/userscript.tsx',
        userscript: {
          name: 'xb',
          namespace: 'https://github.com/dddaniel1/xb',
          version: packageJson.version,
          description: 'xb — Redesign Weibo, like X but even better. 油猴脚本版。',
          author: 'nnecec',
          license: 'GPL-3.0',
          homepageURL: 'https://github.com/dddaniel1/xb',
          supportURL: 'https://github.com/dddaniel1/xb/issues',
          icon: 'https://raw.githubusercontent.com/dddaniel1/xb/main/public/icon/logo-128.png',
          downloadURL: 'https://raw.githubusercontent.com/dddaniel1/xb/main/dist/xb.user.js',
          updateURL: 'https://raw.githubusercontent.com/dddaniel1/xb/main/dist/xb.meta.js',
          'run-at': 'document-start',
          match: WEIBO_MATCHES,
          // `@grant` decides whether the script can use GM_* APIs. Keep this
          // list explicit: the runtime shim in src/lib/platform/browser-api.ts
          // relies on every entry here.
          grant: [
            'GM_getValue',
            'GM_setValue',
            'GM_deleteValue',
            'GM_listValues',
            'GM_addValueChangeListener',
            'GM_removeValueChangeListener',
            'GM_xmlhttpRequest',
            'GM_cookie',
            UNSAFE_WINDOW_GRANT as never,
          ],
          connect: [
            'weibo.com',
            'www.weibo.com',
            'm.weibo.cn',
            'xb-server.nnecec-3d5.workers.dev',
            'cdn.jsdelivr.net',
            ...MEDIA_CONNECTS,
          ],
        },
        build: {
          fileName: 'xb.user.js',
          metaFileName: true,
          autoGrant: false,
          // The bundle contains a handful of `import()` calls from upstream
          // packages. vite-plugin-monkey emits a SystemJS wrapper for those;
          // inline SystemJS so the script has no `@require` dependencies.
          systemjs: 'inline',
        },
        server: {
          prefix: 'dev:',
          open: true,
        },
        styleImport: false,
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    define: {
      __XB_VERSION__: JSON.stringify(packageJson.version),
      // The extension used WXT's `import.meta.env.FIREFOX` flag to tweak a
      // couple of URLs. A userscript always runs in one engine sandbox, so the
      // Chromium-style absolute API base works everywhere.
      'import.meta.env.FIREFOX': 'false',
      'import.meta.env.XB_SERVER_URL': JSON.stringify(env.XB_SERVER_URL ?? ''),
      'import.meta.env.VITE_XB_SIGN_SECRET': JSON.stringify(signSecret),
      'import.meta.env.XB_SIGN_SECRET': JSON.stringify(env.XB_SIGN_SECRET ?? ''),
    },
    build: {
      target: 'es2022',
      cssCodeSplit: false,
      // A userscript must be a single file: inline every `import()` that the
      // app uses for lazy routes/dialogs instead of emitting chunks.
      rollupOptions: {
        output: {
          codeSplitting: false,
        },
      },
    },
  }
})
