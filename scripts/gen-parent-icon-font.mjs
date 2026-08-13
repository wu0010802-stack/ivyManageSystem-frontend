/**
 * 產生家長端自架 Material Symbols Rounded 子集字型。
 *
 * 用法：npm run gen:parent-icons（需網路，只在開發機跑；產物 commit 進 repo）
 *
 * 為什麼自架：LIFF（LINE 內嵌 WebView）冷啟時若 Google Fonts CDN 慢或不可達，
 * display=swap 會讓全 app 圖示 render 成 ligature 原文（check_circle 之類的
 * 英文字串），把每列版面撐爆（2026-08-12/13 prod 實測事故）。改為同源自架
 * 子集字型（~數十 KB）+ font-display: block，冷啟即載、不依賴第三方 CDN。
 *
 * 流程：
 *  1. 以 scripts/lib/parent-icon-names.mjs 掃出所有用到的 icon 名（寧多勿漏）
 *  2. 打 Google css2 的 icon_names 參數要子集字型；無效名稱以二分法剔除
 *  3. 下載 woff2 → src/parent/assets/fonts/，並寫 manifest 供守衛測試比對
 *
 * FILL 軸保留 0..1 範圍：M3NavigationBar active tab 用 filled 變體
 * （舊 CDN URL 把 FILL 釘死在 0，filled 從未真正生效）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractIconNames } from './lib/parent-icon-names.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FONT_DIR = path.join(repoRoot, 'src/parent/assets/fonts')
const FONT_FILE = path.join(FONT_DIR, 'material-symbols-rounded-subset.woff2')
const MANIFEST_FILE = path.join(FONT_DIR, 'material-symbols-manifest.json')

// 軸序依 css2 規則：小寫軸在前、大寫軸在後，各自字母序
const AXES = 'opsz,wght,FILL,GRAD@24,400,0..1,0'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function css2Url(names) {
  return `https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:${AXES}`
    + `&icon_names=${names.join(',')}&display=block`
}

async function fetchCss(names) {
  const res = await fetch(css2Url(names), { headers: { 'User-Agent': UA } })
  return res.ok ? await res.text() : null
}

/** 二分法找出 css2 接受的名稱子集（無效名稱會讓整個請求 400） */
async function filterValid(names) {
  if (names.length === 0) return []
  if (await fetchCss(names) !== null) return names
  if (names.length === 1) {
    console.warn(`  ✗ 非有效 Material Symbols 名稱，剔除：${names[0]}`)
    return []
  }
  const mid = Math.ceil(names.length / 2)
  return [
    ...(await filterValid(names.slice(0, mid))),
    ...(await filterValid(names.slice(mid))),
  ]
}

const candidates = extractIconNames(repoRoot)
console.log(`掃描到 ${candidates.length} 個候選名稱，向 Google css2 驗證中…`)

const icons = await filterValid(candidates)
console.log(`有效 icon：${icons.length} 個（剔除 ${candidates.length - icons.length} 個雜訊）`)
if (icons.length === 0) throw new Error('沒有任何有效 icon，中止')

const css = await fetchCss(icons)
const m = css.match(/src:\s*url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)\s*format\(['"]?woff2/)
if (!m) throw new Error(`css2 回應裡找不到 woff2 URL：\n${css.slice(0, 500)}`)

const fontRes = await fetch(m[1], { headers: { 'User-Agent': UA } })
if (!fontRes.ok) throw new Error(`下載 woff2 失敗：HTTP ${fontRes.status}`)
const buf = Buffer.from(await fontRes.arrayBuffer())

fs.mkdirSync(FONT_DIR, { recursive: true })
fs.writeFileSync(FONT_FILE, buf)
fs.writeFileSync(MANIFEST_FILE, JSON.stringify({
  note: '由 npm run gen:parent-icons 產生；candidates 供 iconFontSubset.spec.ts 守衛比對，勿手改',
  axes: AXES,
  iconCount: icons.length,
  icons,
  candidates,
}, null, 2) + '\n')

console.log(`✓ ${path.relative(repoRoot, FONT_FILE)}（${(buf.length / 1024).toFixed(1)} KB，${icons.length} icons）`)
console.log(`✓ ${path.relative(repoRoot, MANIFEST_FILE)}`)
