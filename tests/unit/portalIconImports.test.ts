/**
 * Element Plus 圖示元件漏 import，13+ 處渲染成空白（bug-hunt 2026-07-27）。
 *
 * vite.config.js 的 ElementPlusResolver 有 `if (!/^El[A-Z]/.test(name)) return`，
 * 只會自動解析 `<ElIconXxx />` 寫法；`src/main.ts` 也沒有任何 app.component 全域註冊。
 * 因此 `<Bell />` 這種寫法必須逐一 import——同 repo 的 AdminSidebar.vue 顯式 import
 * 了 28 個圖示，證明慣例就是如此。
 *
 * 漏 import 的後果純視覺但很顯眼：教師端側邊欄五個群組標題與所有選單項目、手機底部
 * 五個 tab、header 右上角頭像的圖示全是空白只剩文字；薪資頁月份切換變成兩顆完全空白
 * 的圓鈕（看不出哪顆是上／下月）。dev console 則被
 * `Failed to resolve component: UserFilled/HomeFilled/…` 洗版。
 *
 * 本檔以靜態掃描守住：教師端檔案裡用到的 icons-vue 元件都必須在該檔 import。
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import * as ElementPlusIcons from '@element-plus/icons-vue'

const ROOT = path.resolve(__dirname, '../..')
const SCAN_DIRS = [
  'src/layouts',
  'src/views/portal',
  'src/components/portal',
]

const ICON_NAMES = new Set(Object.keys(ElementPlusIcons))

function vueFiles(dir: string): string[] {
  const abs = path.join(ROOT, dir)
  if (!fs.existsSync(abs)) return []
  const out: string[] = []
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...vueFiles(rel))
    else if (entry.name.endsWith('.vue')) out.push(rel)
  }
  return out
}

/** `<Bell />`、`<Bell/>`、`<Bell></Bell>` 這類直接使用 */
function usedAsComponent(src: string): Set<string> {
  const found = new Set<string>()
  for (const m of src.matchAll(/<([A-Z][A-Za-z0-9]*)[\s/>]/g)) {
    if (ICON_NAMES.has(m[1])) found.add(m[1])
  }
  return found
}

/**
 * 以字串傳入 icon（解析不到，會渲染成空白）：
 *   icon="UserFilled" / prefix-icon="User" / :icon="'ArrowLeft'"
 *
 * ⚠ 必須用負向 lookbehind 排除已綁定的寫法。單純比對 `icon="..."` 子字串會把
 * `:prefix-icon="User"` 這種**正確**的綁定也一起抓進來（它含有 `icon="User"`），
 * 產生假警報。
 */
function usedAsIconString(src: string): Set<string> {
  const found = new Set<string>()
  // 未綁定：屬性名前面不可有 `:`
  for (const m of src.matchAll(
    /(?<![:\w-])(?:[a-z]+-)?icon="([A-Z][A-Za-z0-9]*)"/g,
  )) {
    if (ICON_NAMES.has(m[1])) found.add(m[1])
  }
  // 已綁定但傳字串字面值
  for (const m of src.matchAll(
    /:(?:[a-z]+-)?icon="'([A-Z][A-Za-z0-9]*)'"/g,
  )) {
    if (ICON_NAMES.has(m[1])) found.add(m[1])
  }
  return found
}

function importedIcons(src: string): Set<string> {
  const found = new Set<string>()
  for (const m of src.matchAll(
    /import\s*\{([^}]*)\}\s*from\s*['"]@element-plus\/icons-vue['"]/g,
  )) {
    for (const name of m[1].split(',')) {
      const clean = name.trim().split(/\s+as\s+/)[0].trim()
      if (clean) found.add(clean)
    }
  }
  return found
}

describe('教師端 Element Plus 圖示 import 完整性', () => {
  it('用到的圖示元件都必須在該檔 import，否則渲染成空白', () => {
    const offenders: string[] = []

    for (const dir of SCAN_DIRS) {
      for (const rel of vueFiles(dir)) {
        const src = fs.readFileSync(path.join(ROOT, rel), 'utf8')
        const imported = importedIcons(src)
        const missing = [...usedAsComponent(src)].filter((n) => !imported.has(n))
        if (missing.length) offenders.push(`${rel}: ${missing.join(', ')}`)
      }
    }

    expect(offenders, `以下檔案用了未 import 的圖示：\n${offenders.join('\n')}`).toEqual(
      [],
    )
  })

  it('不得以字串傳 icon（ElementPlusResolver 不解析，會渲染成空白）', () => {
    const offenders: string[] = []

    for (const dir of SCAN_DIRS) {
      for (const rel of vueFiles(dir)) {
        const src = fs.readFileSync(path.join(ROOT, rel), 'utf8')
        const asString = [...usedAsIconString(src)]
        if (asString.length) offenders.push(`${rel}: ${asString.join(', ')}`)
      }
    }

    expect(
      offenders,
      `以下檔案以字串傳 icon，應改綁元件：\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})
