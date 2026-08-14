import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import MoodBadge from '../MoodBadge.vue'

const css = readFileSync(resolve(__dirname, '../MoodBadge.vue'), 'utf-8')

describe('MoodBadge — 童彩化（P4）', () => {
  it('mood=happy 渲染開心 emoji', () => {
    const w = mount(MoodBadge, { props: { mood: 'happy', showLabel: true } })
    expect(w.text()).toContain('開心')
  })

  it('mood=null 渲染未記錄 fallback', () => {
    const w = mount(MoodBadge, { props: { mood: null, showLabel: true } })
    expect(w.text()).toContain('未記錄')
  })

  it.each([
    ['sun', 'sun'],
    ['grape', 'grape'],
    ['sky', 'sky'],
    ['coral', 'coral'],
  ])('tone-%s 走童彩 %s container', (tone, accent) => {
    const re = new RegExp(`\\.tone-${tone}\\s+\\.mood-emoji\\s*\\{[^}]*var\\(--pt-accent-${accent}-container`, 's')
    expect(css).toMatch(re)
  })

  it('tone-cream（normal 心情）維持中性 --cream，不強行套童彩', () => {
    expect(css).toMatch(/\.tone-cream\s+\.mood-emoji\s*\{[^}]*var\(--cream/s)
  })
})
