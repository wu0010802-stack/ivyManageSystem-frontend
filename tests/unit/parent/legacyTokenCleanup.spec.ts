import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, '../../../src/parent/styles/globals.css'), 'utf-8')

const REMOVED_TOKENS = [
  '--sky-50:', '--sky-200:', '--sky-300:', '--sky-500:', '--sky-900:',
  '--sun-500:',
  '--leaf-500:',
  '--grape-300:', '--grape-500:',
]

describe('Legacy raw token 死代碼清理（P4）', () => {
  it.each(REMOVED_TOKENS)('%s 已從 globals.css 移除（零消費確認，見 P4 計畫盤點）', (token) => {
    expect(css).not.toContain(token)
  })

  it('--leaf-700 明確保留（對比守衛依賴，非零消費 token）', () => {
    // aaContrast.spec.ts 第 51 行要求 dark 區塊含 --leaf-700: 覆寫，
    // 即使目前無 .vue 消費其值，此 token 是對比安全網完整性契約的一部分，
    // 誤刪會讓既有守衛紅燈——此測試防止未來重蹈覆轍。
    expect(css).toContain('--leaf-700:')
    const darkStart = css.indexOf(":root[data-theme='dark']")
    expect(css.slice(darkStart)).toContain('--leaf-700:')
  })
})
