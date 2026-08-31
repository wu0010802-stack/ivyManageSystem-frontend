#!/usr/bin/env node
/**
 * 部署後煙霧測試（fb §3.4）：驗證 nginx 的 per-host 品牌注入真的生效。
 *
 * 這支是「品牌注入」這條鏈唯一的端到端防呆。它擋的四件事各自對應一個真實故障：
 *
 * | 斷言 | 擋掉的故障 |
 * |---|---|
 * | 回應不含 `{{TB_` | conf 沒被載入 / map 漏 token → 家長看到 `{{TB_ORG_NAME}}` |
 * | og:site_name 等於該租戶期望值 | map 漏整個 host 條目 → 該租戶吃到 default（別間園所）的 og 卡片 |
 * | 帶 `Accept-Encoding: gzip` 再驗一次 | 有人加了 `gzip_static` → sub_filter 拿到已壓縮 body，token 原樣外洩 |
 * | 假 host 回 404 | 未知 host 守衛沒開 → 攻擊者自建 DNS 就能拿到真實園所的品牌與海報 |
 *
 * 用法：
 *   node scripts/check-brand-tokens.mjs --base https://{host}          # {host} 會被代入
 *   node scripts/check-brand-tokens.mjs --base http://127.0.0.1:8080 --host-header
 *   加 --expect-host-guard 才啟用第 4 項（TENANT_HOST_GUARD=on 之後才會過）
 *
 * `--host-header` 模式：不靠 DNS，改用 `Host:` 標頭打同一個 IP，本機驗證用。
 */

import { loadBranding } from './brand-tokens-lib.mjs'

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const has = (name) => process.argv.includes(name)

const BASE = arg('--base', '')
const USE_HOST_HEADER = has('--host-header')
const EXPECT_HOST_GUARD = has('--expect-host-guard')
const UNKNOWN_HOST = arg('--unknown-host', 'definitely-not-a-tenant.invalid')

const PATHS = ['/index.html', '/parent/', '/public.html', '/manifest.webmanifest', '/parent.webmanifest', '/public.webmanifest']

if (!BASE) {
  console.error('[check-brand-tokens] ✗ 需要 --base，例如 --base https://{host}')
  process.exit(2)
}

const failures = []
const fail = (msg) => {
  failures.push(msg)
  console.error(`  ✗ ${msg}`)
}

function urlFor(host, path) {
  return USE_HOST_HEADER ? `${BASE}${path}` : `${BASE.replace('{host}', host)}${path}`
}

async function get(host, path, { gzip = false } = {}) {
  const headers = {}
  if (USE_HOST_HEADER) headers.Host = host
  headers['Accept-Encoding'] = gzip ? 'gzip' : 'identity'
  const res = await fetch(urlFor(host, path), { headers, redirect: 'manual' })
  return { status: res.status, body: await res.text() }
}

async function checkTenant(tenant) {
  const host = tenant.hosts[0]
  console.log(`\n[check-brand-tokens] ${tenant.slug} @ ${host}`)

  for (const path of PATHS) {
    for (const gzip of [false, true]) {
      const label = `${path}${gzip ? ' (gzip)' : ''}`
      let res
      try {
        res = await get(host, path, { gzip })
      } catch (e) {
        fail(`${label} 請求失敗：${String(e)}`)
        continue
      }
      if (res.status !== 200) {
        fail(`${label} 回 ${res.status}（期望 200）`)
        continue
      }
      if (res.body.includes('{{TB_')) {
        const leftover = [...new Set([...res.body.matchAll(/\{\{(TB_[A-Z0-9_]+)\}\}/g)].map((m) => m[1]))]
        fail(`${label} 殘留 token：${leftover.join(', ')}${gzip ? '（gzip 模式殘留 → 檢查是否誤用 gzip_static）' : ''}`)
        continue
      }
      console.log(`  ✓ ${label}`)
    }
  }

  // og:site_name 必須是「這一間」的名字，不是 default 的
  const { body } = await get(host, '/public.html')
  const siteName = body.match(/property="og:site_name"\s+content="([^"]*)"/)?.[1]
  if (siteName !== tenant.tokens.TB_ORG_NAME) {
    fail(`og:site_name = ${JSON.stringify(siteName)}，期望 ${JSON.stringify(tenant.tokens.TB_ORG_NAME)}（map 漏這個 host？）`)
  } else {
    console.log(`  ✓ og:site_name = ${siteName}`)
  }
}

async function checkUnknownHost() {
  console.log(`\n[check-brand-tokens] 未知 host 守衛：${UNKNOWN_HOST}`)
  if (!EXPECT_HOST_GUARD) {
    console.log('  – 略過（未帶 --expect-host-guard；TENANT_HOST_GUARD=on 之後請加上）')
    return
  }
  try {
    const res = await get(UNKNOWN_HOST, '/public.html')
    if (res.status !== 404) {
      fail(`未知 host 回 ${res.status}，期望 404（TENANT_HOST_GUARD 沒開？未知 host 正在拿到真實園所的品牌）`)
    } else {
      console.log('  ✓ 未知 host 回 404')
    }
  } catch (e) {
    fail(`未知 host 請求失敗：${String(e)}`)
  }
}

const { tenants } = loadBranding()
for (const t of tenants) await checkTenant(t)
await checkUnknownHost()

if (failures.length) {
  console.error(`\n[check-brand-tokens] ✗ ${failures.length} 項失敗`)
  process.exit(1)
}
console.log('\n[check-brand-tokens] ✓ 全部通過')
