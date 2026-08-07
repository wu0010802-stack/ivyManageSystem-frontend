#!/usr/bin/env node
/**
 * `branding/tenants.json` → `nginx-tenant-brand.conf` + `dist/brand-version.json`。
 *
 * 由 `npm run prebuild` 自動執行（npm 生命週期，`npm run build` 之前）；Dockerfile 的
 * runtime stage 把產出的 conf `COPY` 到 `/etc/nginx/conf.d/00-tenant-brand.conf`
 * （`00-` 前綴保證先於 `default.conf` 載入，因為 `map` 必須在 http context 且早於
 * server block 使用）。
 *
 * ⚠ **必須跑在 build 之前**：`brand-version.json` 要寫進 `public/`，讓 vite 把它拷進
 * dist、workbox 掃 dist 時才收得進 precache manifest。build 之後才產生就進不了
 * precache，CT-F-04 那條「品牌改動傳到已安裝 PWA」的唯一機制會靜默失效。
 *
 * 產出兩樣東西：
 *
 * 1. **每個 token 一個 `map $host $tb_<token>`**，供 `nginx.conf.template` 的
 *    `sub_filter` 使用。default 分支 = default tenant（現行字面），使單租戶輸出等價。
 * 2. **`$tb_known_host`**（未知 host 守衛，scan-frontend GAP-13）：只有 tenants.json
 *    列出的 host 為 1。`TENANT_HOST_GUARD=on` 時未列入的 host 一律 404，避免攻擊者
 *    自建 DNS / CDN 誤配 / 直連 IP 拿到某間真實園所的 og 卡片與海報。
 *    ⚠ 平台健康檢查用的 host 必須先列進 tenants.json，否則部署會被自己擋掉。
 * 3. **`dist/brand-version.json`**：內容 = tenants.json 的內容 hash。它被
 *    `vite.config.js` 的 `globPatterns` 收進 precache ⇒ 改品牌值 → hash 變 →
 *    workbox revision 變 → 已安裝 PWA 的三個 HTML precache 條目重抓（CT-F-04）。
 *    沒有這條，token 化後 dist 對所有租戶內容相同，改品牌永遠傳不到已安裝的 PWA。
 *
 * 用法：node scripts/gen-tenant-brand-conf.mjs [--out <conf 路徑>] [--public <public 目錄>]
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadBranding, ORIGIN_TOKEN } from './brand-tokens-lib.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const OUT_CONF = resolve(arg('--out', join(REPO_ROOT, 'nginx-tenant-brand.conf')))
const PUBLIC_DIR = resolve(arg('--public', join(REPO_ROOT, 'public')))

/** nginx 字串值：以雙引號包起來，跳脫反斜線與雙引號。中文不需處理。 */
function nginxStr(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** token 名 → nginx 變數名（`TB_ADMIN_TITLE` → `$tb_admin_title`）。 */
export function varNameOf(token) {
  return `$${token.toLowerCase()}`
}

function buildConf({ tokenKeys, tenants, defaultTenant, hash }) {
  const lines = []
  lines.push('# ⚠ 由 scripts/gen-tenant-brand-conf.mjs 從 branding/tenants.json 產生，勿手改。')
  lines.push('# 改品牌值請改 branding/tenants.json 後重新 build。')
  lines.push(`# tenants.json content hash: ${hash}`)
  lines.push(`# default tenant: ${defaultTenant.slug}（其 tokens = 改造前的現行字面，單租戶輸出等價）`)
  lines.push('#')
  lines.push('# ⛔ 守則：不得改用 gzip_static 預壓縮 .gz —— sub_filter 無法處理已壓縮的 body，')
  lines.push('#    token 會原樣外洩到使用者畫面（scripts/check-brand-tokens.mjs 有 gzip 斷言）。')
  lines.push('')

  // slug（L3 品牌資產 overlay 的 try_files 路徑用）
  const slugPairs = tenants.flatMap((t) => t.hosts.map((h) => [h.toLowerCase(), t.slug]))
  lines.push(...mapBlock('$tb_slug', defaultTenant.slug, slugPairs))

  for (const token of tokenKeys) {
    if (token === 'TB_SLUG') continue // 已在上面產生
    const pairs = tenants.flatMap((t) => t.hosts.map((h) => [h.toLowerCase(), t.tokens[token]]))
    lines.push(...mapBlock(varNameOf(token), defaultTenant.tokens[token], pairs))
  }

  // 未知 host 守衛（GAP-13）
  const knownPairs = tenants.flatMap((t) => t.hosts.map((h) => [h.toLowerCase(), '1']))
  lines.push('# 未知 host 守衛：只有 tenants.json 列出的 host 為 1。')
  lines.push('# nginx.conf.template 在 TENANT_HOST_GUARD=on 時對 0 回 404。')
  lines.push(...mapBlock('$tb_known_host', '0', knownPairs, { quote: false }))

  lines.push(`# ${ORIGIN_TOKEN} 不在此檔：nginx 直接用 $scheme://$host 展開（CT-F-09）。`)
  lines.push('')
  return lines.join('\n')
}

function mapBlock(varName, defaultValue, pairs, { quote = true } = {}) {
  const q = quote ? nginxStr : (v) => String(v)
  const out = [`map $host ${varName} {`, `    default ${q(defaultValue)};`]
  for (const [host, value] of pairs) out.push(`    ${host} ${q(value)};`)
  out.push('}', '')
  return out
}

function main() {
  const branding = loadBranding()

  writeFileSync(OUT_CONF, buildConf(branding), 'utf8')
  console.log(`[gen-tenant-brand-conf] ✓ ${OUT_CONF}（${branding.tenants.length} 個租戶）`)

  // brand-version.json 寫進 public/：vite 會整包拷進 dist，workbox 掃 dist 時才收得進
  // precache manifest（CT-F-04）。build 之後才產生就進不了 precache。
  mkdirSync(PUBLIC_DIR, { recursive: true })
  const versionPath = join(PUBLIC_DIR, 'brand-version.json')
  writeFileSync(
    versionPath,
    `${JSON.stringify({ hash: branding.hash, tenants: branding.tenants.length }, null, 2)}\n`,
    'utf8',
  )
  console.log(`[gen-tenant-brand-conf] ✓ ${versionPath}（hash ${branding.hash}）`)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
