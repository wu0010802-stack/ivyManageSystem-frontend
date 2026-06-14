import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// 系統設計審查 2026-06-14（前端維度）：家長端（src/parent）與公開報名端
// （src/public）兩個入口理應 Element Plus-free——家長 / 公開頁不該載入 admin UI
// 庫整包。原本只靠 vite.config manualChunks 註解提醒 + 人工 review 維繫，一旦某個
// SFC 不小心用了 <el-xxx> 或靜態 import element-plus，EP chunk 就會被靜態橋接進該
// 入口、污染首屏 bundle，且回歸只能靠人 review 抓到。
//
// 此 gate 把該約定固化成 CI 紅線。
//
// 放行：`await import('element-plus')` 動態 import（code-split、lazy 按需載入，不會
// 打進首屏 bundle，是正確的逃生門——ParentOfflineIndicator.vue 即以此模式載入
// ElMessageBox 確認框）。靜態 import 與 <el-xxx> template 標籤才會造成靜態打包。

const SCAN_DIRS = ['src/parent', 'src/public']
// 靜態 import 一定有 `from 'element-plus'`；動態 import('element-plus') 無 from → 不命中
const STATIC_EP_IMPORT = /\bfrom\s*['"]element-plus['"]/
const EL_TEMPLATE_TAG = /<el-[a-z]/

function collectFiles(dir: string): string[] {
  const out: string[] = []
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      out.push(...collectFiles(full))
    } else if (
      /\.(vue|ts|tsx|js)$/.test(e.name) &&
      !/\.(test|spec)\.|__tests__/.test(full)
    ) {
      out.push(full)
    }
  }
  return out
}

describe('parent / public 入口必須 Element Plus-free（bundle 隔離 gate）', () => {
  const files = SCAN_DIRS.flatMap(collectFiles)

  it('掃描到檔案（測試非 vacuous）', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('無靜態 import element-plus', () => {
    const offenders = files.filter((f) =>
      STATIC_EP_IMPORT.test(readFileSync(f, 'utf8')),
    )
    expect(
      offenders,
      `這些檔靜態 import element-plus（會把 EP 整包靜態打進該入口）：\n${offenders.join(
        '\n',
      )}\n如需 ElMessageBox 等，請改 await import('element-plus') 動態載入`,
    ).toEqual([])
  })

  it('template 無 <el-xxx> 標籤（會觸發 auto-import 把 EP 靜態打進 bundle）', () => {
    const offenders = files.filter((f) =>
      EL_TEMPLATE_TAG.test(readFileSync(f, 'utf8')),
    )
    expect(
      offenders,
      `這些檔 template 用了 <el-xxx>（會被 unplugin-vue-components 靜態 resolve）：\n${offenders.join(
        '\n',
      )}`,
    ).toEqual([])
  })
})
