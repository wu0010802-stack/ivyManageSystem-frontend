import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import QuickLinksCard from '@/components/portal/home/QuickLinksCard.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
})

// QuickLinksCard 是 hardcoded 8 個連結，使用 .link-tile class 的 button
const EXPECTED_LABELS = ['班級學生', '課堂觀察', '作品上傳', '用藥執行', '事件紀錄', '學期評量', '成長軌跡', '才藝點名']

describe('QuickLinksCard', () => {
  it('renders 8 link tiles', () => {
    const w = mount(QuickLinksCard, { global: { plugins: [router] } })
    const tiles = w.findAll('.link-tile')
    expect(tiles.length).toBe(8)
  })

  it('renders all expected link labels', () => {
    const w = mount(QuickLinksCard, { global: { plugins: [router] } })
    EXPECTED_LABELS.forEach((label) => {
      expect(w.text()).toContain(label)
    })
  })

  it('renders card title "快速進入"', () => {
    const w = mount(QuickLinksCard, { global: { plugins: [router] } })
    expect(w.text()).toContain('快速進入')
  })

  it('mounts without props (no required props)', () => {
    expect(() => mount(QuickLinksCard, { global: { plugins: [router] } })).not.toThrow()
  })

  it('clicking 班級學生 tile pushes to /portal/students', async () => {
    const push = vi.spyOn(router, 'push')
    const w = mount(QuickLinksCard, { global: { plugins: [router] } })
    const tiles = w.findAll('.link-tile')
    // tiles[0] = 班級學生 → '/portal/students'
    await tiles[0].trigger('click')
    expect(push).toHaveBeenCalledWith('/portal/students')
  })

  it('clicking 才藝點名 tile pushes to route with query', async () => {
    const push = vi.spyOn(router, 'push')
    const w = mount(QuickLinksCard, { global: { plugins: [router] } })
    const tiles = w.findAll('.link-tile')
    // tiles[7] = 才藝點名 → { path: '/portal/activity', query: { tab: 'attendance' } }
    await tiles[7].trigger('click')
    expect(push).toHaveBeenCalledWith({ path: '/portal/activity', query: { tab: 'attendance' } })
  })

  it('each tile has a tint dot element', () => {
    const w = mount(QuickLinksCard, { global: { plugins: [router] } })
    const dots = w.findAll('.tile-dot')
    expect(dots.length).toBe(8)
  })
})
