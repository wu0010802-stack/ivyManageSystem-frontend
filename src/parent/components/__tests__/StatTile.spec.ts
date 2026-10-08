import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import StatTile from '../StatTile.vue'

const mountTile = (props) =>
  mount(StatTile, { props, global: { stubs: { 'router-link': RouterLinkStub } } })

describe('StatTile', () => {
  it('render label / value / sub', () => {
    const w = mountTile({ label: '待繳學費', value: '$4,200', sub: '6/30 前' })
    expect(w.text()).toContain('待繳學費')
    expect(w.text()).toContain('$4,200')
    expect(w.text()).toContain('6/30 前')
  })

  it('無 to 時不是連結', () => {
    const w = mountTile({ label: 'x', value: '1' })
    expect(w.findComponent(RouterLinkStub).exists()).toBe(false)
  })

  it('有 to 時為 router-link + aria-label', () => {
    const w = mountTile({ label: '待簽文件', value: '1 份', to: '/events' })
    const link = w.findComponent(RouterLinkStub)
    expect(link.exists()).toBe(true)
    expect(link.props('to')).toBe('/events')
    expect(link.attributes('aria-label')).toBe('待簽文件 1 份')
  })

  it('icon prop 渲染 Material Symbol（aria-hidden）', () => {
    const w = mountTile({ label: 'x', value: '1', icon: 'payments' })
    const ic = w.find('.stat-tile-icon')
    expect(ic.text()).toBe('payments')
    expect(ic.attributes('aria-hidden')).toBe('true')
  })

  it('tone 套對應 class', () => {
    const w = mountTile({ label: 'x', value: '1', tone: 'amber' })
    expect(w.find('.stat-tile').classes()).toContain('tone-amber')
  })

  it('tone=leaf 套對應 class', () => {
    const w = mountTile({ label: 'x', value: '1', tone: 'leaf' })
    expect(w.find('.stat-tile').classes()).toContain('tone-leaf')
  })
})
