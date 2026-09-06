#!/usr/bin/env node
/**
 * 後台表單 dialog 棘輪（只准降、不准升）。spec：docs/superpowers/specs/2026-09-06-admin-form-dialog-defaults-design.md §3.4
 *
 * 為什麼要擋：三波表單規範（FormSection／dialog 殼層／compact-standard-wide 分型）都寫進
 * DESIGN.md，但盤點期約 84 檔 dialog 表單（棘輪基線以 --list 實測為準）裡 label-top 12、
 * 寬度常數 0、未儲存保護 6。根因是每個新 dialog 都從 EP 裸預設起步，規範靠人記。本腳本把
 * 四個數字鎖進版控，新表單請用 `src/components/common/FormDialog.vue`。
 *
 * 指標：
 *   A 裸 dialog 表單：每個 <el-dialog 區塊（至對應 </el-dialog>）內含 <el-form（非 el-form-item）
 *     即計 1（區塊數，非檔數——同檔多個裸 dialog 各自計）
 *   B label-width：含 <el-dialog 的檔案內 `label-width=` 出現次數（label-top 下是死屬性）
 *   C 硬寫寬度：<el-dialog … width="NNN[px]"> 出現次數（應改 FORM_DIALOG_WIDTH／FormDialog size）
 *   D 按鈕誤用：新增／建立主鈕 type="success"，或任何按鈕文字以「＋」「+」開頭（次數）
 *
 * 用法：
 *   node scripts/check-form-dialogs.mjs            # 檢查（與 BASELINE 比）
 *   node scripts/check-form-dialogs.mjs --list     # 列出所有出現位置與四個數字
 *   node scripts/check-form-dialogs.mjs --root DIR # 掃指定根目錄（測試用）
 *
 * 退出碼：0=符合 baseline；1=任一指標超標，或低於 baseline 但未調降數字。
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

/** 修掉幾處後必須同步調降，否則棘輪鬆掉（同 check-error-detail-ratchet 慣例）。 */
const BASELINE = { A: 101, B: 89, C: 162, D: 20 } // 2026-09-06 Task 9 調降：旗艦 F1／F2（活動課程、收付款）遷移 FormDialog 後實測

/** 本來就該含 el-dialog 的檔案：FormDialog 殼本身。 */
const EXEMPT = new Set(['src/components/common/FormDialog.vue'])

const EXCLUDE_DIR = /(^|\/)(portal|parent|public|kiosk|__tests__|node_modules)(\/|$)/
const SCAN_DIRS = ['src/views', 'src/components']

const args = process.argv.slice(2)
const listMode = args.includes('--list')
const rootIdx = args.indexOf('--root')
if (rootIdx >= 0 && args[rootIdx + 1] === undefined) {
  console.error('用法：node scripts/check-form-dialogs.mjs [--list] [--root <dir>]\n  --root 缺少參數值')
  process.exit(2)
}
const ROOT = rootIdx >= 0 ? args[rootIdx + 1] : process.cwd()

const RE_DIALOG = /<el-dialog\b/
const RE_DIALOG_OPEN_G = /<el-dialog\b/g
const CLOSE_DIALOG_TAG = '</el-dialog>'
const RE_FORM = /<el-form(?![-\w])/
const RE_LABEL_WIDTH = /\blabel-width=/g
const RE_PX_WIDTH = /<el-dialog\b[^>]*\swidth="\d+(?:px)?"/g
const RE_SUCCESS_CREATE = /<el-button\b[^>]*type="success"[^>]*>\s*(?:<[^>]+>\s*)*(?:新增|建立)/g
const RE_PLUS_TEXT = /<el-button\b[^>]*>\s*[＋+]\s*\S/g

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const rel = relative(ROOT, full).replace(/\\/g, '/')
    if (EXCLUDE_DIR.test(rel)) continue
    if (statSync(full).isDirectory()) { walk(full, out); continue }
    if (entry.endsWith('.vue')) out.push({ full, rel })
  }
  return out
}

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)))
const hits = { A: [], B: [], C: [], D: [] }

for (const { full, rel } of files) {
  if (EXEMPT.has(rel)) continue
  const src = readFileSync(full, 'utf8')
  const hasDialog = RE_DIALOG.test(src)
  if (hasDialog) {
    // A：逐個 <el-dialog> 區塊獨立判定，避免同檔另有 FormDialog 用法就整檔豁免
    // （Task 7 遷移期常見：同檔一個已換 FormDialog、另一個仍是裸 el-dialog）。
    RE_DIALOG_OPEN_G.lastIndex = 0
    let openMatch
    while ((openMatch = RE_DIALOG_OPEN_G.exec(src))) {
      const start = openMatch.index
      const closeIdx = src.indexOf(CLOSE_DIALOG_TAG, start)
      const end = closeIdx >= 0 ? closeIdx + CLOSE_DIALOG_TAG.length : src.length
      const block = src.slice(start, end)
      if (RE_FORM.test(block)) hits.A.push(`${rel}:${lineOf(src, start)}`)
    }
    for (const m of src.matchAll(RE_LABEL_WIDTH)) hits.B.push(`${rel}:${lineOf(src, m.index)}`)
    for (const m of src.matchAll(RE_PX_WIDTH)) hits.C.push(`${rel}:${lineOf(src, m.index)}`)
  }
  for (const m of src.matchAll(RE_SUCCESS_CREATE)) hits.D.push(`${rel}:${lineOf(src, m.index)}`)
  for (const m of src.matchAll(RE_PLUS_TEXT)) hits.D.push(`${rel}:${lineOf(src, m.index)}`)
}

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length
}

const counts = { A: hits.A.length, B: hits.B.length, C: hits.C.length, D: hits.D.length }
const summary = `A=${counts.A} B=${counts.B} C=${counts.C} D=${counts.D}`

if (listMode) {
  for (const key of ['A', 'B', 'C', 'D']) {
    console.log(`\n[${key}] ${counts[key]} 處`)
    for (const h of hits[key]) console.log(`  ${h}`)
  }
  console.log(`\n${summary}`)
  process.exit(0)
}

const over = Object.keys(counts).filter((k) => counts[k] > BASELINE[k])
if (over.length) {
  console.error(
    `✗ 表單 dialog 棘輪超標：${summary}（baseline A=${BASELINE.A} B=${BASELINE.B} C=${BASELINE.C} D=${BASELINE.D}）\n` +
      `  超標指標：${over.join(', ')}\n\n` +
      `新的表單 dialog 請用 <FormDialog size="compact|standardNarrow|standard|wide">（src/components/common/FormDialog.vue），\n` +
      `el-form 用 label-position="top"、不寫 label-width；新增主鈕用 type="primary" + :icon="Plus"。\n` +
      `跑 \`node scripts/check-form-dialogs.mjs --list\` 看完整清單。`
  )
  process.exit(1)
}

const under = Object.keys(counts).filter((k) => counts[k] < BASELINE[k])
if (under.length) {
  console.error(
    `✗ 存量已降（${summary}）但 baseline 仍是 A=${BASELINE.A} B=${BASELINE.B} C=${BASELINE.C} D=${BASELINE.D}。\n` +
      `請把 scripts/check-form-dialogs.mjs 的 BASELINE 改成現值，把成果鎖進版控。`
  )
  process.exit(1)
}

console.log(`✓ 表單 dialog 棘輪維持 ${summary}`)
