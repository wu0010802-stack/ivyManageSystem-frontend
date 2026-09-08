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

// 公告分類策展圖示清單（2026-09-08 anncat01）：後台 admin console 選的分類圖示，
// 存進 AnnouncementCategoryOut.icon 這個自由字串欄位，家長端未來顯示分類徽章時
// 會直接沿用同一批名稱。該清單躺在 src/constants/（不在下面 SCAN_ROOTS 內），
// 靜態掃描永遠抓不到，故在此顯式 import 真正的原始清單（非複製貼上一份 value）
// 併入候選集——這樣以後清單改動（新增/刪除/改名圖示）重跑 gen:parent-icons
// 會自動跟著同步，不會再犯「巧合收錄」的錯（4 個名稱 priority_high／
// medical_services／groups／flag 曾經因為不在任何家長端既有用法裡而漏收，
// 2026-09-08 補上）。這個 import 兩邊執行環境都吃得下：直接用 `node` 跑本檔
// （gen-parent-icon-font.mjs）靠 Node ≥24（見 package.json engines）原生的
// TS 型別剝離；vitest 跑本檔（iconFontSubset.spec.ts）則靠 vite-node 本來就會
// transform 依賴圖裡的 .ts——兩者都不需要額外掛 ts-node/tsx 之類的 loader。
import { ANNOUNCEMENT_CATEGORY_ICON_OPTIONS } from '../../src/constants/announcementCategoryIcons.ts'

/** 掃描根（相對 repo root）。src/components/common 因家長端會用到 MobileErrorRetry 等共用元件而納入。 */
export const SCAN_ROOTS = ['src/parent', 'src/components/common']

/**
 * 動態組出 icon 名、靜態掃描抓不到時，登記在這裡。
 * 公告分類策展清單（src/constants/announcementCategoryIcons.ts）顯式併入，見上方 import 說明。
 */
export const EXTRA_ICONS = ANNOUNCEMENT_CATEGORY_ICON_OPTIONS.map((o) => o.value)

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

/**
 * @param {string} src 檔案內容
 * @param {Set<string>} names 收集用
 * @param {{ scanAllLines?: boolean }} [opts] scanAllLines：整檔每行都當 icon 行掃
 *   （檔名含 icon 的檔，如 iconMapping.ts——它的 ICON_MAP 值行 `trophy: 'emoji_events',`
 *   整行沒有 icon 字樣，規則 5 看不到；2026-09-02 孩子頁標題圖示缺字的根因）
 */
function collectFromSource(src, names, opts = {}) {
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
    if (!opts.scanAllLines && !/icon/i.test(line)) continue
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
      collectFromSource(fs.readFileSync(file, 'utf8'), names, {
        scanAllLines: /icon/i.test(path.basename(file)),
      })
    }
  }
  return [...names].filter((n) => NAME_RE.test(n)).sort()
}
