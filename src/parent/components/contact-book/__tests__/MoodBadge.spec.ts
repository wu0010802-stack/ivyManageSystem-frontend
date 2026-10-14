import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import MoodBadge from '../MoodBadge.vue'

const css = readFileSync(resolve(__dirname, '../MoodBadge.vue'), 'utf-8')

describe('MoodBadge — 童彩化（P4）', () => {
  it('mood=happy 渲染開心標籤', () => {
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
    const re = new RegExp(`\\.tone-${tone}\\s+\\.mood-icon\\s*\\{[^}]*var\\(--pt-accent-${accent}-container`, 's')
    expect(css).toMatch(re)
  })

  it('tone-cream（normal 心情）維持中性 --cream，不強行套童彩', () => {
    expect(css).toMatch(/\.tone-cream\s+\.mood-icon\s*\{[^}]*var\(--cream/s)
  })
})

// D-27（2026-10-14）：心情由 emoji 改 Material icon（與聯絡簿統計格 MOOD_STAT_ICON 同一組圖示）。
// emoji 在不同 LINE／OS 版本長相不一、深色模式下不跟 token 變色，也不受高對比模式控制。
describe('MoodBadge — Material icon（D-27）', () => {
  it.each([
    ['happy', 'sentiment_very_satisfied', '開心'],
    ['normal', 'sentiment_neutral', '普通'],
    ['tired', 'bedtime', '想睡'],
    ['sad', 'sentiment_dissatisfied', '難過'],
    ['sick', 'sick', '不舒服'],
  ])('mood=%s 渲染 Material icon「%s」，aria-label 為「心情：%s」', (mood, glyph, text) => {
    const w = mount(MoodBadge, { props: { mood } })
    const host = w.find('.mood-icon')
    expect(host.attributes('role')).toBe('img')
    expect(host.attributes('aria-label')).toBe(`心情：${text}`)
    const glyphEl = host.find('.material-symbols-rounded')
    expect(glyphEl.exists()).toBe(true)
    expect(glyphEl.text()).toBe(glyph)
    expect(glyphEl.attributes('aria-hidden')).toBe('true')
  })

  it('null／未知 mood 渲染 fallback icon「remove」與「未記錄」', () => {
    for (const mood of [null, 'unknown-mood']) {
      const w = mount(MoodBadge, { props: { mood, showLabel: true } })
      expect(w.find('.material-symbols-rounded').text()).toBe('remove')
      expect(w.find('.mood-icon').attributes('aria-label')).toBe('心情：未記錄')
      expect(w.text()).toContain('未記錄')
      expect(w.classes()).toContain('tone-muted')
    }
  })

  it('不再輸出任何 emoji 字元（含 fallback 的「・」）', () => {
    for (const mood of ['happy', 'normal', 'tired', 'sad', 'sick', null]) {
      const w = mount(MoodBadge, { props: { mood, showLabel: true } })
      expect(w.text(), String(mood)).not.toMatch(/\p{Extended_Pictographic}|・/u)
    }
  })

  it('三種尺寸 class 仍在（sm／md／lg）', () => {
    for (const size of ['sm', 'md', 'lg']) {
      expect(mount(MoodBadge, { props: { mood: 'happy', size } }).classes()).toContain(`is-${size}`)
    }
  })

  it('icon 顏色走各 tone 的 -on token（深色／高對比模式自動跟著換），不寫死色碼', () => {
    for (const accent of ['sun', 'grape', 'sky', 'coral']) {
      const re = new RegExp(`\\.tone-${accent}\\s+\\.mood-icon\\s*\\{[^}]*color:\\s*var\\(--pt-accent-${accent}-on`, 's')
      expect(css).toMatch(re)
    }
  })

  it('icon 字級隨尺寸 class 設定，並帶 FILL 變體', () => {
    expect(css).toMatch(/\.is-lg\s+\.mood-icon\s+\.material-symbols-rounded\s*\{[^}]*font-size/s)
    expect(css).toMatch(/font-variation-settings:\s*'FILL'\s*1/)
  })
})
