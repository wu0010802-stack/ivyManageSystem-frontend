#!/usr/bin/env node
/**
 * 對 `dist/` **就地**把 `{{TB_*}}` 換成 default tenant 的值（CT-F-03）。
 *
 * 為什麼需要這支：`vite.config.js` 的 dev plugin 走 `transformIndexHtml`，那個 hook
 * **只在 dev server 生效**（初稿宣稱它也涵蓋 `vite preview` 已由 CT-F-03 撤回）。
 * 於是任何「跑 dist 產物但前面沒有 nginx」的環境都會看到殘留 token：
 *   1. `npm run preview`（package.json 已串成 `apply-brand-tokens && vite preview`）
 *   2. 後端 repo 的 Playwright E2E（跨 repo checkout 前端後跑 dist）
 *   3. 任何本機/CI 起靜態伺服器驗證 dist 的情境
 *
 * ⚠ 這支**只用 default tenant 的值**——它不是多租戶方案的一部分，只是「單租戶等價
 * 輸出」的補丁。真正的 per-tenant 注入在 nginx（`sub_filter` + `$host` map）。
 *
 * 用法：node scripts/apply-brand-tokens.mjs [--dist <目錄>] [--tenant <slug>]
 * 冪等：已替換過的 dist 再跑一次不會壞（找不到 token 就是 0 replacements）。
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { findTokens, loadBranding, TOKENIZED_DIST_FILES, tokenMapFor, replaceTokens } from './brand-tokens-lib.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const DIST = resolve(arg('--dist', join(REPO_ROOT, 'dist')))
const TENANT_SLUG = arg('--tenant', '')

function main() {
  if (!existsSync(DIST)) {
    console.error(`[apply-brand-tokens] ✗ 找不到 ${DIST}，請先 npm run build`)
    process.exit(1)
  }

  const { tenants, defaultTenant } = loadBranding()
  const tenant = TENANT_SLUG ? tenants.find((t) => t.slug === TENANT_SLUG) : defaultTenant
  if (!tenant) {
    console.error(`[apply-brand-tokens] ✗ branding/tenants.json 沒有 slug=${TENANT_SLUG} 的租戶`)
    process.exit(1)
  }
  const map = tokenMapFor(tenant)

  let total = 0
  const leftovers = []
  for (const rel of TOKENIZED_DIST_FILES) {
    const path = join(DIST, rel)
    if (!existsSync(path)) continue // manifest 可能因 build 設定不同而缺，不視為錯誤
    const before = readFileSync(path, 'utf8')
    const after = replaceTokens(before, map)
    if (after !== before) {
      writeFileSync(path, after, 'utf8')
      total += 1
    }
    const rest = findTokens(after)
    if (rest.length) leftovers.push(`${rel}: ${[...new Set(rest)].join(', ')}`)
  }

  if (leftovers.length) {
    // fail-loud：殘留 token 代表 tenants.json 少宣告了某個 key，畫面會出現 `{{TB_`。
    console.error('[apply-brand-tokens] ✗ 仍有未替換的 token（tenants.json 缺 key？）：')
    for (const l of leftovers) console.error(`    ${l}`)
    process.exit(1)
  }
  console.log(`[apply-brand-tokens] ✓ ${DIST}（tenant=${tenant.slug}，改寫 ${total} 個檔案）`)
}

main()
