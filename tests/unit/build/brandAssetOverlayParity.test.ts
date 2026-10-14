import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 租戶品牌資產的兩道關卡必須對「同一組檔名」一致：
 *  1. nginx.conf.template 的 L3 overlay location：依 $host 把 /brand/<slug>/ 的檔案換進同一個 URL；
 *  2. vite.config.js 的 workbox runtimeCaching `brand-assets`（SW StaleWhileRevalidate）：
 *     已安裝 PWA 的家長靠它在下一次導航拿到新圖。
 * 只修一邊會出現「新訪客看到租戶 logo、已安裝 PWA 的家長卻永遠是預設 logo」（或反過來）。
 */
const root = process.cwd()
const nginx = readFileSync(join(root, 'nginx.conf.template'), 'utf8')
const viteConfig = readFileSync(join(root, 'vite.config.js'), 'utf8')

/** nginx L3 overlay location 的 regex（此處語法同為 JS 相容子集）。 */
function overlayRegex(): RegExp {
  const m = nginx.match(/^\s*location ~ (\^\/\(LOGO\\\.png\|[^\s]+\$) \{/m)
  if (!m) throw new Error('nginx.conf.template 找不到 L3 品牌資產 overlay location')
  return new RegExp(m[1])
}

/** vite.config.js 中 brand-assets 規則的 pathname regex（以原始碼字面值取出）。 */
function swBrandRegex(): RegExp {
  const m = viteConfig.match(/(\/\^\\\/\(LOGO\\\.png\|[^\n]*?)\.test\(url\.pathname\)/)
  if (!m) throw new Error('vite.config.js 找不到 brand-assets 的 pathname regex')
  // 取出的是原始碼裡的 regex 字面值（自家檔案，非外部輸入）
  return new Function(`return ${m[1]}`)() as RegExp
}

/** 目前被 overlay 的全部品牌檔（public/ 內真實存在，列表腐爛時下方「檔案存在」測試會紅）。 */
const BRAND_PATHS = [
  '/LOGO.png',
  '/logo.svg',
  '/favicon.ico',
  '/apple-touch-icon-180x180.png',
  '/pwa-64x64.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/maskable-icon-512x512.png',
  '/parent-pwa-192x192.png',
  '/parent-pwa-512x512.png',
  '/parent-maskable-512x512.png',
  '/images/activity-poster.jpg',
  '/images/login-logo.png',
  '/images/login-logo-512.png',
  '/images/ivy-kids-loading.png',
]

describe('租戶品牌資產：nginx overlay 白名單', () => {
  it('家長端登入／綁定頁實際引用的 login-logo-512.png 在白名單內（否則租戶 logo 永遠是預設檔）', () => {
    for (const view of ['LoginView', 'BindView', 'BindAdditionalView']) {
      const src = readFileSync(join(root, `src/parent/views/${view}.vue`), 'utf8')
      expect(src, `${view} 不再引用 login-logo-512.png，請同步檢查白名單`).toContain(
        '/images/login-logo-512.png',
      )
    }
    expect(overlayRegex().test('/images/login-logo-512.png')).toBe(true)
  })

  it('白名單不外溢：不相干的 images 檔與帶尾綴的檔名不被 overlay', () => {
    const re = overlayRegex()
    expect(re.test('/images/login-logo-512.png.bak')).toBe(false)
    expect(re.test('/images/login-logo-1024.png')).toBe(false)
    expect(re.test('/images/other.png')).toBe(false)
  })
})

describe('租戶品牌資產：nginx overlay 與 SW brand-assets 規則一致', () => {
  it('BRAND_PATHS 列的檔案都真實存在於 public/（列表腐爛時先改這裡）', () => {
    for (const p of BRAND_PATHS) {
      expect(existsSync(join(root, 'public', p)), p).toBe(true)
    }
  })

  it('每個被 nginx overlay 的品牌檔，SW brand-assets 規則也必須命中（已安裝 PWA 才吃得到租戶圖）', () => {
    const nginxRe = overlayRegex()
    const swRe = swBrandRegex()
    for (const p of BRAND_PATHS) {
      expect(nginxRe.test(p), `nginx overlay 未涵蓋 ${p}`).toBe(true)
      expect(swRe.test(p), `SW brand-assets 未涵蓋 ${p}`).toBe(true)
    }
  })

  it('public/images 下新增的 login-logo 變體（如日後的 -1024）必須兩邊同時納入', () => {
    const nginxRe = overlayRegex()
    const swRe = swBrandRegex()
    const variants = readdirSync(join(root, 'public/images')).filter((f) => f.startsWith('login-logo'))
    expect(variants.length).toBeGreaterThan(0)
    for (const f of variants) {
      expect(nginxRe.test(`/images/${f}`), `nginx overlay 未涵蓋 /images/${f}`).toBe(true)
      expect(swRe.test(`/images/${f}`), `SW brand-assets 未涵蓋 /images/${f}`).toBe(true)
    }
  })
})
