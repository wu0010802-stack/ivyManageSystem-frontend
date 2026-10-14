import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const nginx = readFileSync(join(root, 'nginx.conf.template'), 'utf8')

/** 取出「L3 品牌資產 overlay」那條 location 的 regex（nginx PCRE 與此處用到的語法同為 JS 相容子集）。 */
function overlayRegex(): RegExp {
  const m = nginx.match(/^\s*location ~ (\^\/\(LOGO\\\.png\|[^\s]+\$) \{/m)
  if (!m) throw new Error('nginx.conf.template 找不到 L3 品牌資產 overlay location')
  return new RegExp(m[1])
}

describe('nginx 租戶品牌 overlay 白名單', () => {
  it('家長端登入／綁定頁實際引用的 login-logo-512.png 在白名單內（否則租戶 logo 永遠是預設檔）', () => {
    for (const view of ['LoginView', 'BindView', 'BindAdditionalView']) {
      const src = readFileSync(join(root, `src/parent/views/${view}.vue`), 'utf8')
      expect(src, `${view} 不再引用 login-logo-512.png，請同步檢查白名單`).toContain(
        '/images/login-logo-512.png',
      )
    }
    expect(overlayRegex().test('/images/login-logo-512.png')).toBe(true)
  })

  it('原本的 login-logo.png 與其他既有品牌資產仍在白名單內', () => {
    const re = overlayRegex()
    for (const path of [
      '/images/login-logo.png',
      '/images/activity-poster.jpg',
      '/images/ivy-kids-loading.png',
      '/LOGO.png',
      '/favicon.ico',
      '/parent-pwa-192x192.png',
    ]) {
      expect(re.test(path), path).toBe(true)
    }
  })

  it('白名單不外溢：不相干的 images 檔與帶尾綴的檔名不被 overlay', () => {
    const re = overlayRegex()
    expect(re.test('/images/login-logo-512.png.bak')).toBe(false)
    expect(re.test('/images/login-logo-1024.png')).toBe(false)
    expect(re.test('/images/other.png')).toBe(false)
  })
})
