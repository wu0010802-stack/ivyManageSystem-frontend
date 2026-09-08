// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

const pwa = vi.hoisted(() => ({ options: null as unknown as { workbox: { manifestTransforms?: ((entries: object[]) => { manifest: { url: string; revision?: string | null }[] })[] } } }))
vi.mock('vite-plugin-pwa', () => ({ VitePWA: (options: typeof pwa.options) => { pwa.options = options; return [] } }))
import config from '../../../vite.config.js'

function manifestFor(bundle: object) {
  const plugin = config.plugins.flat().find((p: { name?: string }) => p?.name === 'ivy-precache-static-dependencies')
  plugin?.generateBundle({}, bundle)
  let entries = [{ url: 'index.html', revision: 'html' }, { url: 'brand-version.json', revision: 'brand' }, { url: 'assets/main-HASH.js', revision: null }]
  for (const transform of pwa.options.workbox.manifestTransforms ?? []) entries = transform(entries).manifest
  return entries
}
const chunk = (imports: string[] = [], css: string[] = [], dynamicImports: string[] = []) => ({
  type: 'chunk', code: 'export const value = 1', imports, dynamicImports,
  viteMetadata: { importedCss: new Set(css) },
})

describe('PWA 已預快取 JS 的靜態依賴閉包', () => {
  it('main 經 admin-core 依賴未知名稱 chunk 與 CSS 時全部加入快取，排除 dynamic 路由及品牌圖', () => {
    const entries = manifestFor({
      'assets/main-HASH.js': chunk(['assets/admin-core-ONE.js'], [], ['assets/lazy-FEE.js']),
      'assets/admin-core-ONE.js': chunk(['assets/index-TWO.js'], ['assets/admin-STYLE.css']),
      'assets/index-TWO.js': chunk(['assets/main-HASH.js']),
      'assets/admin-STYLE.css': { type: 'asset', source: '.app { color: green }' },
      'assets/lazy-FEE.js': chunk(['assets/chart-LAZY.js']),
      'assets/chart-LAZY.js': chunk(),
      'logo.svg': { type: 'asset', source: '<svg />' },
    })
    expect(entries.map(e => e.url).sort()).toEqual([
      'index.html', 'brand-version.json', 'assets/main-HASH.js', 'assets/admin-core-ONE.js',
      'assets/index-TWO.js', 'assets/admin-STYLE.css',
    ].sort())
    expect(new Set(entries.map(e => e.url)).size).toBe(entries.length)
    expect(entries.find(e => e.url === 'brand-version.json')?.revision).toBe('brand')
  })

  it('缺少靜態依賴產物時讓 build 失敗，不能產出會白頁的 SW', () => {
    expect(() => manifestFor({ 'assets/main-HASH.js': chunk(['assets/missing.js']) })).toThrow('assets/missing.js')
  })
})
