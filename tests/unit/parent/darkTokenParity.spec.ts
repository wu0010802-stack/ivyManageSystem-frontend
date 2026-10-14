import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 深色模式 token 對稱守衛。
 *
 * 2026-10 實測：--pt-surface-raised（#fff）／--pt-surface-recessed 只有 light 定義，
 * dark 下 LeaveHero「0 天 已請」、UserHeroCard 姓名、ActivityHero 概況數字都變成
 * 白底配近白字。根因是「light 新增表面／文字 token 時忘了補 dark」——這類 token
 * 疊的是已會翻色的 --pt-text-*，一缺 dark 值就必定出現對比崩壞，所以把對稱性鎖成規則。
 */
const css = readFileSync(resolve(__dirname, '../../../src/parent/styles/globals.css'), 'utf-8')
const darkStart = css.indexOf(":root[data-theme='dark']")
const light = css.slice(0, darkStart)
const darkBlockEnd = css.indexOf('\n}', darkStart)
const dark = css.slice(darkStart, darkBlockEnd)

function definedTokens(block: string, prefix: RegExp): Set<string> {
  const names = new Set<string>()
  for (const m of block.matchAll(/(--[a-z0-9-]+)\s*:/g)) {
    if (prefix.test(m[1])) names.add(m[1])
  }
  return names
}

const MUST_FLIP = /^--pt-(surface|text|gradient)-/

describe('globals.css 深色 token 對稱', () => {
  it('找得到 dark 區塊', () => {
    expect(darkStart).toBeGreaterThan(0)
    expect(darkBlockEnd).toBeGreaterThan(darkStart)
  })

  it('hero 用的 --pt-surface-raised／--pt-surface-recessed 在 dark 有覆寫', () => {
    expect(dark).toMatch(/--pt-surface-raised\s*:/)
    expect(dark).toMatch(/--pt-surface-recessed\s*:/)
  })

  it('dark 的 raised／recessed 不得沿用 light 的淺色值', () => {
    const raised = dark.match(/--pt-surface-raised\s*:\s*([^;]+);/)?.[1].trim().toLowerCase()
    const recessed = dark.match(/--pt-surface-recessed\s*:\s*([^;]+);/)?.[1].trim().toLowerCase()
    expect(raised).toBeDefined()
    expect(recessed).toBeDefined()
    expect(['#fff', '#ffffff']).not.toContain(raised)
    expect(recessed).not.toBe('#f5fbe6')
  })

  it('light 有定義的 --pt-surface-*／--pt-text-*／--pt-gradient-* 在 dark 也必須有', () => {
    const lightNames = definedTokens(light, MUST_FLIP)
    const darkNames = definedTokens(dark, MUST_FLIP)
    const missing = [...lightNames].filter((n) => !darkNames.has(n))
    expect(lightNames.size).toBeGreaterThan(10)
    expect(missing).toEqual([])
  })
})
