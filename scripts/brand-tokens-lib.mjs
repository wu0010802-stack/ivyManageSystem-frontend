/**
 * `branding/tenants.json` 的載入與驗證（fb 叢集，L1 品牌 token）。
 *
 * 三個腳本 + vite dev plugin + parity 測試共用這一支，避免各自寫一份解析而漂移：
 *   - scripts/gen-tenant-brand-conf.mjs  → nginx map + brand-version.json
 *   - scripts/apply-brand-tokens.mjs     → dist 就地替換（vite preview / E2E / 無 nginx）
 *   - scripts/check-brand-tokens.mjs     → 部署後煙霧測試
 *   - vite.config.js 的 brand-tokens dev plugin
 *
 * ⛔ 缺欄一律 throw（= fail build）。理由：漏一個 token 的後果是該租戶的網頁上出現
 * 別間園所的名字或殘留 `{{TB_`，兩者都要在 build 期就被擋下來，不能等部署後才發現。
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const TENANTS_JSON = join(REPO_ROOT, 'branding', 'tenants.json')

/** 帶 token 的檔案（相對 repo root / dist root，兩邊路徑相同除了 manifest 少一層 public/）。 */
export const TOKENIZED_SOURCE_FILES = [
  'index.html',
  'parent/index.html',
  'public.html',
  'public/manifest.webmanifest',
  'public/parent.webmanifest',
  'public/public.webmanifest',
]

export const TOKENIZED_DIST_FILES = [
  'index.html',
  'parent/index.html',
  'public.html',
  'manifest.webmanifest',
  'parent.webmanifest',
  'public.webmanifest',
]

/** `TB_ORIGIN` 不進 tenants.json 的 tokens（nginx 用 `$scheme://$host` 展開，CT-F-09）。 */
export const ORIGIN_TOKEN = 'TB_ORIGIN'

export function readTenantsFile(path = TENANTS_JSON) {
  return { raw: readFileSync(path, 'utf8'), path }
}

/**
 * 解析 + 驗證。回 `{ tokenKeys, tenants, defaultTenant, hash }`。
 * `tenants[i].tokens` 保證含全部 `tokenKeys`；`hosts` 保證非空且無重複。
 */
export function loadBranding(path = TENANTS_JSON) {
  const { raw } = readTenantsFile(path)
  const data = JSON.parse(raw)

  const tokenKeys = data.tokenKeys
  if (!Array.isArray(tokenKeys) || tokenKeys.length === 0) {
    throw new Error(`[brand-tokens] ${path}：tokenKeys 必須是非空陣列`)
  }
  if (tokenKeys.includes(ORIGIN_TOKEN)) {
    throw new Error(`[brand-tokens] ${ORIGIN_TOKEN} 不得列入 tokenKeys（由 nginx $scheme://$host 展開）`)
  }

  const tenants = data.tenants
  if (!Array.isArray(tenants) || tenants.length === 0) {
    throw new Error(`[brand-tokens] ${path}：tenants 必須是非空陣列`)
  }

  const seenHosts = new Map()
  const seenSlugs = new Set()
  for (const t of tenants) {
    if (!t.slug) throw new Error('[brand-tokens] 每個 tenant 都必須有 slug')
    if (seenSlugs.has(t.slug)) throw new Error(`[brand-tokens] slug 重複：${t.slug}`)
    seenSlugs.add(t.slug)

    if (!Array.isArray(t.hosts) || t.hosts.length === 0) {
      throw new Error(`[brand-tokens] tenant ${t.slug} 的 hosts 必須是非空陣列（同時是未知 host 守衛的白名單）`)
    }
    for (const h of t.hosts) {
      const host = String(h).toLowerCase()
      if (seenHosts.has(host)) {
        throw new Error(`[brand-tokens] host 被兩個租戶宣告：${host}（${seenHosts.get(host)} / ${t.slug}）`)
      }
      seenHosts.set(host, t.slug)
    }

    if (!t.origin || !/^https?:\/\//.test(t.origin)) {
      throw new Error(`[brand-tokens] tenant ${t.slug} 缺 origin（需含 scheme，供 dev plugin / apply-brand-tokens 展開 ${ORIGIN_TOKEN}）`)
    }

    const tokens = t.tokens ?? {}
    const missing = tokenKeys.filter((k) => typeof tokens[k] !== 'string' || tokens[k] === '')
    if (missing.length) {
      throw new Error(`[brand-tokens] tenant ${t.slug} 缺 token：${missing.join(', ')}`)
    }
    const extra = Object.keys(tokens).filter((k) => !tokenKeys.includes(k))
    if (extra.length) {
      throw new Error(`[brand-tokens] tenant ${t.slug} 有未宣告的 token：${extra.join(', ')}（請先加進 tokenKeys）`)
    }
    if (tokens.TB_SLUG !== t.slug) {
      throw new Error(`[brand-tokens] tenant ${t.slug} 的 TB_SLUG（${tokens.TB_SLUG}）必須等於 slug`)
    }
  }

  const defaults = tenants.filter((t) => t.default === true)
  if (defaults.length !== 1) {
    throw new Error(`[brand-tokens] 必須恰好一個 default: true 的租戶（目前 ${defaults.length} 個）`)
  }

  return {
    tokenKeys,
    tenants,
    defaultTenant: defaults[0],
    // 內容 hash：進 brand-version.json → 被 workbox precache → 改品牌值即觸發
    // SW 更新，讓已安裝 PWA 的三個 HTML precache 條目重抓（CT-F-04）。
    hash: createHash('sha256').update(raw).digest('hex').slice(0, 16),
  }
}

/** 某租戶的完整替換表（含 `TB_ORIGIN`）。 */
export function tokenMapFor(tenant) {
  return { ...tenant.tokens, [ORIGIN_TOKEN]: tenant.origin.replace(/\/+$/, '') }
}

/** 把 `{{TB_X}}` 全部換成 map 內的值；map 沒有的 token 保留原樣（讓 fail-loud 檢查抓得到）。 */
export function replaceTokens(text, map) {
  return text.replace(/\{\{(TB_[A-Z0-9_]+)\}\}/g, (whole, key) =>
    Object.prototype.hasOwnProperty.call(map, key) ? map[key] : whole,
  )
}

/** 掃出文字內所有 `{{TB_*}}` token 名。 */
export function findTokens(text) {
  return [...text.matchAll(/\{\{(TB_[A-Z0-9_]+)\}\}/g)].map((m) => m[1])
}
