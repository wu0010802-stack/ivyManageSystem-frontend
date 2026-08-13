/**
 * 家長端 Material Symbols icon 名稱抽取器。
 *
 * 供兩處共用（單一事實來源，兩邊掃描結果恆一致）：
 *  - scripts/gen-parent-icon-font.mjs：產自架子集字型時決定要包哪些 icon
 *  - src/parent/__tests__/iconFontSubset.spec.ts：守衛測試，
 *    新增 icon 但忘記重跑 `npm run gen:parent-icons` 時讓 CI 紅燈
 *
 * 抽取策略是「寧可多收不可漏收」：多收的名字只讓子集字型多幾個 glyph
 * （幾百 byte），漏收則該 icon 在 prod 直接 render 成 ligature 原文。
 */
import fs from 'node:fs'
import path from 'node:path'

/** 掃描根（相對 repo root）。src/components/common 因家長端會用到 MobileErrorRetry 等共用元件而納入。 */
export const SCAN_ROOTS = ['src/parent', 'src/components/common']

/**
 * 動態組出 icon 名、靜態掃描抓不到時，登記在這裡。
 * 目前為空；新增時附上使用處路徑註解。
 */
export const EXTRA_ICONS = []

const NAME_RE = /^[a-z][a-z0-9_]{1,40}$/

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue
      walk(full, out)
    } else if (/\.(vue|ts)$/.test(entry.name)
      && !/\.(spec|test)\.[jt]s$/.test(entry.name)
      && !entry.name.endsWith('.d.ts')) {
      out.push(full)
    }
  }
  return out
}

function collectFromSource(src, names) {
  // 1) <M3Icon name="x"> / <ParentIcon name="x">（含跨行屬性）
  for (const m of src.matchAll(/<(?:M3Icon|ParentIcon)\b[^>]*?\bname="([a-z][a-z0-9_]*)"/gs)) {
    names.add(m[1])
  }
  // 2) 動態綁定 :name="cond ? 'a' : 'b'" / :icon="..." 內的字串字面值
  for (const m of src.matchAll(/:(?:name|icon|leading-icon|trailing-icon)="([^"]+)"/g)) {
    for (const lit of m[1].matchAll(/'([a-z][a-z0-9_]*)'/g)) names.add(lit[1])
  }
  // 3) 靜態屬性 icon="x" / leading-icon="x" / trailing-icon="x"
  for (const m of src.matchAll(/\b(?:icon|leading-icon|trailing-icon)="([a-z][a-z0-9_]*)"/g)) {
    names.add(m[1])
  }
  // 4) raw ligature span：<span class="material-symbols-rounded">home</span>
  for (const m of src.matchAll(/class="material-symbols-rounded[^"]*"[^>]*>\s*([a-z][a-z0-9_]*)\s*</g)) {
    names.add(m[1])
  }
  // 5) 行內含 icon 字樣的字串字面值（涵蓋 icon: 'x'、icon: cond ? 'a' : 'b'、
  //    iconMapping 的 ICON_MAP 值等）。寬鬆但受 NAME_RE 過濾。
  for (const line of src.split('\n')) {
    if (!/icon/i.test(line)) continue
    for (const lit of line.matchAll(/['"]([a-z][a-z0-9_]*)['"]/g)) names.add(lit[1])
  }
}

/**
 * @param {string} repoRoot repo 根目錄絕對路徑
 * @returns {string[]} 排序去重後的候選 icon 名（可能含非 icon 的雜訊字串，
 *   由 gen script 對 Google css2 驗證後過濾，最終以 manifest 為準）
 */
export function extractIconNames(repoRoot) {
  const names = new Set(EXTRA_ICONS)
  for (const root of SCAN_ROOTS) {
    const dir = path.join(repoRoot, root)
    if (!fs.existsSync(dir)) continue
    for (const file of walk(dir, [])) {
      collectFromSource(fs.readFileSync(file, 'utf8'), names)
    }
  }
  return [...names].filter((n) => NAME_RE.test(n)).sort()
}
