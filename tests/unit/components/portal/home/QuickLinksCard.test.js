import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'

import QuickLinksCard from '@/components/portal/home/QuickLinksCard.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
})

// SPEC-024 收斂後：班級類功能全數移到「班級」tab（/portal/class），
// 這裡只剩個人／跨班級事項三格（成長軌跡／才藝點名／活動調查）。
// 「接送授權」與其 pending count 徽章亦隨舊十宮格一併移除（元件已不再
// import getPortalPickupPendingCount）。
const EXPECTED_LABELS = ['成長軌跡', '才藝點名', '活動調查']

describe('QuickLinksCard', () => {
  it('renders 3 link tiles', () => {
    const w = mount(QuickLinksCard, { global: { plugins: [router] } })
    const tiles = w.findAll('.link-tile')
    expect(tiles.length).toBe(3)
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

  it('clicking 成長軌跡 tile pushes to /portal/growth', async () => {
    const push = vi.spyOn(router, 'push')
    const w = mount(QuickLinksCard, { global: { plugins: [router] } })
    const tiles = w.findAll('.link-tile')
    await tiles[0].trigger('click')
    expect(push).toHaveBeenCalledWith('/portal/growth')
  })

  it('clicking 才藝點名 tile pushes to route with query', async () => {
    const push = vi.spyOn(router, 'push')
    const w = mount(QuickLinksCard, { global: { plugins: [router] } })
    const tiles = w.findAll('.link-tile')
    await tiles[1].trigger('click')
    expect(push).toHaveBeenCalledWith({ path: '/portal/activity', query: { tab: 'attendance' } })
  })

  it('clicking 活動調查 tile pushes to /portal/surveys', async () => {
    const push = vi.spyOn(router, 'push')
    const w = mount(QuickLinksCard, { global: { plugins: [router] } })
    const tiles = w.findAll('.link-tile')
    await tiles[2].trigger('click')
    expect(push).toHaveBeenCalledWith('/portal/surveys')
  })

  it('each tile has a tint dot element', () => {
    const w = mount(QuickLinksCard, { global: { plugins: [router] } })
    const dots = w.findAll('.tile-dot')
    expect(dots.length).toBe(3)
  })
})
