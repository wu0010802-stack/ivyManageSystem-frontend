// src/parent/components/__tests__/DashboardHero.spec.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DashboardHero from '../DashboardHero.vue'

describe('DashboardHero', () => {
  it('render title / value / eyebrow', () => {
    const w = mount(DashboardHero, { props: { eyebrow: '本月應繳', title: '小宇', value: '$4,200' } })
    expect(w.text()).toContain('本月應繳')
    expect(w.text()).toContain('小宇')
    expect(w.text()).toContain('$4,200')
  })

  it('statusLabel 有值時渲染 StatusPill', () => {
    const w = mount(DashboardHero, { props: { title: 'x', statusLabel: '已入園 08:32', statusTone: 'ok' } })
    expect(w.find('.status-pill').exists()).toBe(true)
    expect(w.text()).toContain('已入園 08:32')
  })

  it('無 statusLabel 不渲染 pill', () => {
    const w = mount(DashboardHero, { props: { title: 'x' } })
    expect(w.find('.status-pill').exists()).toBe(false)
  })
})
