import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { BRANDING_DEFAULTS } from '@/composables/useTenantBranding'
// @ts-expect-error TODO(ts-strict): scripts/*.mjs 是刻意保留的建置腳本（CLAUDE.md 例外清單），無型別宣告
import { findTokens, loadBranding, ORIGIN_TOKEN } from '../../../scripts/brand-tokens-lib.mjs'

/**
 * 品牌值有**兩份**事實來源，各自服務不同的注入時機：
 *   L1（HTML/manifest，nginx sub_filter）→ `branding/tenants.json`
 *   L2（SPA runtime，tenant-meta API）  → `BRANDING_DEFAULTS`
 *
 * 兩份漂開的後果是「分頁標題寫 A 校、PWA 安裝名寫 B 校」這種沒有任何執行期錯誤、
 * 只有使用者會發現的 bug。本檔就是把兩份釘在一起的那顆釘子。
 */
const read = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf-8')

const branding = loadBranding()
const def = branding.defaultTenant
const tokens: Record<string, string> = def.tokens

describe('branding/tenants.json 自身的完整性', () => {
  it('loadBranding() 通過驗證（缺 token / host 重複 / 多個 default 都會在這裡炸）', () => {
    // loadBranding() 在 import 期就會 throw，跑到這裡代表通過。
    expect(branding.tenants.length).toBeGreaterThan(0)
    expect(def.default).toBe(true)
  })

  it('每個租戶都覆蓋全部 tokenKeys（漏一個 = nginx map 落到 default，吐別間園所的品牌）', () => {
    for (const t of branding.tenants) {
      expect(Object.keys(t.tokens).sort()).toEqual([...branding.tokenKeys].sort())
    }
  })
})

describe('L1 token ↔ L2 BRANDING_DEFAULTS 逐欄 parity', () => {
  // 左：tenants.json 的 token；右：BRANDING_DEFAULTS 的對應路徑。
  // 只列「兩層都有」的欄位；純 L1 的欄位在下一個 it 裡另外交代。
  const PAIRS: Array<[string, string]> = [
    ['TB_ADMIN_TITLE', 'titles.admin'],
    ['TB_PORTAL_TITLE', 'titles.portal'],
    ['TB_PARENT_TITLE', 'titles.parent'],
    ['TB_PUBLIC_TITLE', 'share.og_title'],
    ['TB_ORG_NAME', 'share.site_name'],
    ['TB_META_DESC', 'share.meta_description'],
    ['TB_OG_DESC', 'share.og_description'],
    ['TB_POSTER_ALT', 'share.poster_alt'],
    ['TB_THEME_ADMIN', 'theme.admin_primary'],
    ['TB_THEME_PARENT', 'theme.parent_primary'],
    ['TB_MANIFEST_ADMIN_NAME', 'manifest.admin.name'],
    ['TB_MANIFEST_ADMIN_SHORT', 'manifest.admin.short_name'],
    ['TB_MANIFEST_ADMIN_DESC', 'manifest.admin.description'],
    ['TB_MANIFEST_PARENT_NAME', 'manifest.parent.name'],
    ['TB_MANIFEST_PARENT_SHORT', 'manifest.parent.short_name'],
    ['TB_MANIFEST_PARENT_DESC', 'manifest.parent.description'],
    ['TB_MANIFEST_PUBLIC_NAME', 'manifest.public.name'],
    ['TB_MANIFEST_PUBLIC_SHORT', 'manifest.public.short_name'],
    ['TB_MANIFEST_PUBLIC_DESC', 'manifest.public.description'],
    ['TB_SLUG', 'slug'],
  ]

  const pick = (path: string): unknown =>
    path.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], BRANDING_DEFAULTS)

  it.each(PAIRS)('%s === BRANDING_DEFAULTS.%s', (token, path) => {
    expect(tokens[token]).toBe(pick(path))
  })

  it('PAIRS 覆蓋 tokenKeys 全部，除了刻意只存在於 L1 的欄位', () => {
    // TB_OG_POSTER_V 是 og:image 的 cache-bust 版號，SPA runtime 沒有對應概念。
    const L1_ONLY = new Set(['TB_OG_POSTER_V'])
    const covered = new Set(PAIRS.map(([t]) => t))
    const uncovered = branding.tokenKeys.filter((k: string) => !covered.has(k) && !L1_ONLY.has(k))
    expect(uncovered).toEqual([])
  })

  it('titles.public / manifest.public.name / share.og_title 是三個不同字串（CT-F-02）', () => {
    // 這三個很容易被「順手合併」掉。合併後分頁標題、PWA 安裝名、LINE 卡片標題會變同一句。
    const { titles, manifest, share } = BRANDING_DEFAULTS
    expect(new Set([titles.public, manifest.public.name, share.og_title]).size).toBe(3)
  })

  it('org_name_en 與 school_name_en 是不同字串（footer vs header）', () => {
    expect(BRANDING_DEFAULTS.org_name_en).not.toBe(BRANDING_DEFAULTS.school_name_en)
  })
})

describe('HTML / manifest 內的 token 集合 ⊆ tenants.json 已定義的 token', () => {
  const FILES = [
    'index.html',
    'parent/index.html',
    'public.html',
    'public/manifest.webmanifest',
    'public/parent.webmanifest',
    'public/public.webmanifest',
  ]

  it.each(FILES)('%s 沒有用到未定義的 token', (file) => {
    const declared = new Set<string>([...branding.tokenKeys, ORIGIN_TOKEN])
    const used = [...new Set<string>(findTokens(read(file)))]
    const undefinedTokens = used.filter((t) => !declared.has(t))
    // 未定義的 token 永遠不會被 nginx 替換 → 使用者畫面上直接看到 `{{TB_XXX}}`
    expect(undefinedTokens).toEqual([])
  })

  it('三個 HTML 內不得再出現硬編的機構名（多租戶下等於所有租戶共用同一個名字）', () => {
    for (const file of ['index.html', 'parent/index.html', 'public.html']) {
      expect(read(file)).not.toContain(BRANDING_DEFAULTS.org_name)
    }
  })
})
