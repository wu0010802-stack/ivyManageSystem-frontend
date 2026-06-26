import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf-8')

describe('shared CSS 基建 reset', () => {
  it('design-tokens.css 有全域 box-sizing:border-box reset', () => {
    const css = read('src/assets/design-tokens.css').replace(/\s+/g, ' ')
    expect(css).toMatch(/\*,\s*\*::before,\s*\*::after\s*\{[^}]*box-sizing:\s*border-box/)
  })

  it('main.css 的 .el-card:hover 被 hover 能力守衛包覆', () => {
    const css = read('src/assets/main.css').replace(/\s+/g, ' ')
    expect(css).toMatch(/@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)\s*\{[^@]*\.el-card:hover/)
  })
})
