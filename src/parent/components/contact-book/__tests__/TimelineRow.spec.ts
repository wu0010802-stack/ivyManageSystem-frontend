import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import TimelineRow from '../TimelineRow.vue'

const css = readFileSync(resolve(__dirname, '../TimelineRow.vue'), 'utf-8')

describe('TimelineRow — 童彩化（P4）', () => {
  it('渲染 icon/label/value', () => {
    const w = mount(TimelineRow, { props: { icon: 'restaurant', label: '午餐', value: '3/3' } })
    expect(w.text()).toContain('午餐')
    expect(w.text()).toContain('3/3')
  })

  it.each([
    ['green', 'leaf'],
    ['coral', 'coral'],
    ['grape', 'grape'],
    ['sun', 'sun'],
    ['sky', 'sky'],
  ])('iconTone=%s 的 .dot 走童彩 %s tonal（container+on 配對）', (iconTone, accent) => {
    const re = new RegExp(`\\.tone-${iconTone}\\s+\\.dot\\s*\\{[^}]*var\\(--pt-accent-${accent}-on[^}]*var\\(--pt-accent-${accent}-container`, 's')
    expect(css).toMatch(re)
  })
})
