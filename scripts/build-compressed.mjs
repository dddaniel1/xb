/**
 * Build a self-extracting userscript.
 *
 * The full bundle is gzipped and embedded as base64, then inflated at runtime
 * with `DecompressionStream`. This exists for hosts with a hard code-size limit
 * (Greasy Fork: 2 MiB). The plain `xb.user.js` remains the readable artifact.
 *
 *   node scripts/build-compressed.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))
const source = readFileSync(`${dist}xb.user.js`, 'utf8')

const metadataMatch = source.match(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\n?/)
if (!metadataMatch) throw new Error('userscript metadata block not found')

const metadata = metadataMatch[0].trimEnd()
const body = source.slice(metadataMatch[0].length)

const payload = gzipSync(Buffer.from(body, 'utf8'), { level: 9 }).toString('base64')

// Keep the metadata but replace the update URLs with the compressed artifact.
function rewriteMetadata({ withUpdateUrls }) {
  const lines = metadata.split('\n').filter((line) => {
    return line !== '// ==/UserScript==' && !/^\/\/ @(downloadURL|updateURL)\s/.test(line)
  })

  if (withUpdateUrls) {
    lines.splice(
      lines.length - 1,
      0,
      '// @downloadURL  https://raw.githubusercontent.com/dddaniel1/xb/main/dist/xb.cr.user.js',
      '// @updateURL    https://raw.githubusercontent.com/dddaniel1/xb/main/dist/xb.cr.meta.js',
    )
  }

  return lines.join('\n')
}

const loader = (meta) => `${meta}
// ==/UserScript==

;(async () => {
  // Hide Weibo's native shell while the payload is inflated.
  const antiFlash = document.createElement('style')
  antiFlash.textContent = 'html:not([data-xb-weibo-ready]) #app{visibility:hidden!important}'
  ;(document.head || document.documentElement).appendChild(antiFlash)

  const binary = atob('${payload}')
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }

  const text = await new Response(
    new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')),
  ).text()

  // eslint-disable-next-line no-eval
  eval(text)
})().catch((error) => {
  console.error('[xb] failed to inflate userscript payload', error)
})
`

const github = loader(rewriteMetadata({ withUpdateUrls: true }))
const gf = loader(rewriteMetadata({ withUpdateUrls: false }))

writeFileSync(`${dist}xb.cr.user.js`, github)
writeFileSync(`${dist}xb.cr.gf.user.js`, gf)
writeFileSync(
  `${dist}xb.cr.meta.js`,
  `${rewriteMetadata({ withUpdateUrls: true })}\n// ==/UserScript==\n`,
)

const size = (value) => `${(Buffer.byteLength(value) / 1024 / 1024).toFixed(2)} MB`
console.log(`xb.cr.user.js     ${size(github)}`)
console.log(`xb.cr.gf.user.js  ${size(gf)}`)
