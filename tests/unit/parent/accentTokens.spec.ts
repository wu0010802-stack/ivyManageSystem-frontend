import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, '../../../src/parent/styles/globals.css'), 'utf-8')
const darkStart = css.indexOf(":root[data-theme='dark']")
const light = css.slice(0, darkStart)
const dark = css.slice(darkStart)

const ACCENTS = ['sun', 'coral', 'sky', 'leaf', 'grape'] as const

describe('童彩 tonal 配對（M3 Expressive P1）', () => {
  it.each(ACCENTS)('%s：light 有 container+on 配對', (name) => {
    expect(light).toContain(`--pt-accent-${name}-container:`)
    expect(light).toContain(`--pt-accent-${name}-on:`)
  })
  it.each(ACCENTS)('%s：dark 有 container+on 配對（禁 light-only）', (name) => {
    expect(dark).toContain(`--pt-accent-${name}-container:`)
    expect(dark).toContain(`--pt-accent-${name}-on:`)
  })
  it('尺度 token 已是 Expressive 值（Task 4 隨疊層退場一併升級）', () => {
    expect(light).toContain('--pt-card-radius: 26px')
    expect(light).toContain('--pt-control-radius: 14px')
    expect(light).toContain('--pt-hero-radius: 30px')
  })
})
