import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf-8')

describe('iOS 輸入 16px 保底（消除聚焦放大）', () => {
  it('家長端 globals.css 有全域 input/textarea/select 16px 保底', () => {
    const css = read('src/parent/styles/globals.css').replace(/\s+/g, ' ')
    expect(css).toMatch(/input,\s*textarea,\s*select\s*\{[^}]*font-size:\s*16px/)
  })

  it('portal/admin main.css 在手機斷點放大 el-input 至 16px', () => {
    const css = read('src/assets/main.css').replace(/\s+/g, ' ')
    expect(css).toContain('max-width: 767.98px')
    expect(css).toMatch(/\.el-input__inner[^}]*font-size:\s*16px/)
  })
})
