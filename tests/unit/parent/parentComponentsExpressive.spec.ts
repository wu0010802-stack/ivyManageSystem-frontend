import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (rel: string) =>
  readFileSync(resolve(__dirname, `../../../src/parent/components/${rel}`), 'utf-8')
const readGlobals = () =>
  readFileSync(resolve(__dirname, '../../../src/parent/styles/globals.css'), 'utf-8')

describe('家長端共用元件 Expressive 換膚（P1）', () => {
  it('StatTile 消費童彩配對 token（sky/coral/amber→sun 三個色調）', () => {
    const src = read('StatTile.vue')
    expect(src).toContain('--pt-accent-sky-container')
    expect(src).toContain('--pt-accent-coral-container')
    expect(src).toContain('--pt-accent-sun-container') // amber tone 內部映射到 sun
  })
  it('StatTile icon 有半透明容器（light/dark 各自定義背景）', () => {
    const src = read('StatTile.vue')
    expect(src).toContain('stat-tile-icon-wrap')
  })
  it('SkeletonBlock shimmer 動畫已存在且 reduced-motion 有降階（既有實作已符合，本次不需改動）', () => {
    const src = read('SkeletonBlock.vue')
    expect(src).toContain('@keyframes')
    expect(src).toContain('prefers-reduced-motion')
  })
  it('SectionHeader 消費的 .pt-section-title 標題字重升級為 900', () => {
    const css = readGlobals()
    expect(css).toMatch(/\.pt-section-title\s*\{[^}]*font-weight:\s*900/s)
  })
  it('ContactBookDayCard 用 hero 圓角 token', () => {
    const src = read('contact-book/ContactBookDayCard.vue')
    expect(src).toMatch(/\.day-card\s*\{[^}]*border-radius:\s*var\(--pt-hero-radius/s)
  })
  it('ParentBottomSheet 上緣圓角走 hero token', () => {
    expect(read('ParentBottomSheet.vue')).toMatch(/var\(--pt-hero-radius/)
  })
})
