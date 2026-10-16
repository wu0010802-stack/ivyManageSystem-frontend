/**
 * 守衛測試：Element Plus 的 icon 類 prop 不得傳「圖示名字串」。
 *
 * `icon="UserFilled"` / `:icon="'ArrowLeft'"` 會被 EP 當成元件名去
 * resolveComponent；本專案沒有全域註冊 @element-plus/icons-vue，所以字串
 * 一律解析失敗、靜默渲染成空白——不報錯、單元測試也量不到。2026-10 手機實測
 * 才發現 header 頭像是空圓圈、排班頁「上週」鈕前留一塊空白。
 *
 * 正確寫法：`import { UserFilled } from '@element-plus/icons-vue'` 後
 * `:icon="UserFilled"`。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(process.cwd(), 'src')

// icon / prefix-icon / suffix-icon / clear-icon：靜態 prop="Name" 與綁定字串 :prop="'Name'" 皆攔；
// 綁定元件 :prop="Name" 放行
const STRING_ICON_PROP =
  /\s(?:((?:prefix-|suffix-|clear-)?icon)="([A-Z][A-Za-z]+)"|:((?:prefix-|suffix-|clear-)?icon)="'([A-Z][A-Za-z]+)'")/g

function walkVue(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue
      walkVue(full, out)
    } else if (name.endsWith('.vue')) {
      out.push(full)
    }
  }
  return out
}

describe('EP icon prop 字串守衛', () => {
  it('src/**/*.vue 不以字串傳 icon 類 prop', () => {
    const offenders: string[] = []
    for (const file of walkVue(SRC)) {
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(STRING_ICON_PROP)) {
        offenders.push(`${relative(SRC, file)}: ${m[1] ?? m[3]}="${m[2] ?? m[4]}"`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('pattern 自我檢查：攔得到兩種字串寫法、放過元件綁定', () => {
    const hit = (s: string) => [...s.matchAll(STRING_ICON_PROP)].length
    expect(hit(' icon="UserFilled"')).toBe(1)
    expect(hit(' :icon="\'ArrowLeft\'"')).toBe(1)
    expect(hit(' prefix-icon="Search"')).toBe(1)
    expect(hit(' :icon="UserFilled"')).toBe(0)
    expect(hit(' :prefix-icon="Search"')).toBe(0)
  })
})
