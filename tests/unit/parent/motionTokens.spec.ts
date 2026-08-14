import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, '../../../src/parent/styles/motion.css'), 'utf-8')

describe('家長端動效 token（M3 Expressive P1）', () => {
  it('定義 spring 曲線', () => {
    expect(css).toContain('--motion-spring: cubic-bezier(0.34, 1.56, 0.64, 1)')
  })
  it('定義 emphasized 曲線（alias 到既有 m3 easing）', () => {
    expect(css).toContain('--motion-emphasized: var(--m3-easing-emphasized-decel')
  })
  it('定義三階語意時長', () => {
    expect(css).toContain('--motion-quick: 160ms')
    expect(css).toContain('--motion-base: 260ms')
    expect(css).toContain('--motion-page: 350ms')
  })
})
