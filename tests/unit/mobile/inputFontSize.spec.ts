import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf-8')

describe('iOS 輸入 16px 保底（消除聚焦放大）', () => {
  it('家長端 globals.css 有全域 input/textarea/select 16px 保底', () => {
    const css = read('src/parent/styles/globals.css').replace(/\s+/g, ' ')
    // 家長端字級跟著「字級設定」走 rem，保底寫成 max(16px, 1rem)：縮小時不低於 16px、放大時跟著放大
    expect(css).toMatch(/input,\s*textarea,\s*select\s*\{[^}]*font-size:\s*max\(16px,\s*1rem\)/)
  })

  it('portal/admin main.css 在手機斷點放大 el-input 至 16px', () => {
    const css = read('src/assets/main.css').replace(/\s+/g, ' ')
    expect(css).toContain('max-width: 767.98px')
    expect(css).toMatch(/\.el-input__inner[^}]*font-size:\s*16px/)
    expect(css).toMatch(/\.el-textarea__inner[^}]*font-size:\s*16px/)
    expect(css).toMatch(/\.el-select__wrapper input[^}]*font-size:\s*16px/)
  })

  it('日期區間的 .el-range-input 也在 16px 保底內，且權重高於 EP 按需注入的原規則', () => {
    const css = read('src/assets/main.css').replace(/\s+/g, ' ')
    // EP 原規則 .el-date-editor .el-range-input 隨元件注入、排在 main.css 之後；
    // 同權重會被蓋回 12–14px，故必須多一層 class
    expect(css).toMatch(/\.el-date-editor\.el-range-editor \.el-range-input \{[^}]*font-size:\s*16px/)
  })
})
