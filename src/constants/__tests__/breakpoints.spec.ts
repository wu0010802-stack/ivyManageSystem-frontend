import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BREAKPOINTS, MOBILE_MAX_PX } from '@/constants/breakpoints'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('breakpoints 常數', () => {
  it('提供 canonical 斷點尺度', () => {
    expect(BREAKPOINTS).toEqual({ xs: 480, sm: 768, md: 1024, lg: 1200 })
  })
  it('手機上界由 sm - 0.02 導出', () => {
    expect(MOBILE_MAX_PX).toBe(767.98)
  })
  it('breakpoints.media.css 的 min-width 值與 BREAKPOINTS 一致（單一事實來源）', () => {
    const css = readFileSync(
      resolve(__dirname, '../../assets/breakpoints.media.css'),
      'utf-8',
    )
    for (const [key, px] of Object.entries(BREAKPOINTS)) {
      const re = new RegExp(`--bp-${key}\\s*\\(min-width:\\s*${px}px\\)`)
      expect(css, `--bp-${key} 應為 ${px}px`).toMatch(re)
    }
  })
})
