import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// 結構守衛（資安稽核 2026-10-28 P3，brand.line_bot_friend_url 儲存型 javascript: URL）：
// 擋整類「租戶可寫的品牌／tenant-meta URL 未經 scheme 驗證就綁進 :href」。凡 :href／
// v-bind:href 的運算式引用品牌類資料（brand／branding／tenantMeta／friendUrl／line_bot），
// 必須包在 safeExternalUrl(...) 或 sanitizeHref(...) 內（固定 tel:/mailto:/sms: 前綴的 template 例外）。
const root = process.cwd()
const BRAND_LIKE = /brand|tenantmeta|tenant_meta|friend_?url|line_?bot/i
const SAFE_WRAP = /\b(safeExternalUrl|sanitizeHref)\(/
// 固定 scheme 前綴的 template literal（如 `tel:${branding.contact.phone}`）scheme 由程式碼寫死，
// 品牌值只落在 scheme 之後，無法變成 javascript: → 放行。
const FIXED_SAFE_SCHEME = /^`(tel|mailto|sms):/

function vueFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name !== '__tests__' && name !== 'node_modules') vueFiles(p, out)
    } else if (name.endsWith('.vue')) {
      out.push(p)
    }
  }
  return out
}

describe('品牌 URL :href 綁定守衛', () => {
  it('品牌類 :href 一律經 safeExternalUrl／sanitizeHref', () => {
    const offenders: string[] = []
    for (const f of vueFiles(join(root, 'src'))) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(/(?:v-bind)?:href="([^"]*)"/g)) {
        const expr = m[1]
        if (BRAND_LIKE.test(expr) && !SAFE_WRAP.test(expr) && !FIXED_SAFE_SCHEME.test(expr.trim())) {
          offenders.push(`${relative(root, f)}: ${m[0]}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
