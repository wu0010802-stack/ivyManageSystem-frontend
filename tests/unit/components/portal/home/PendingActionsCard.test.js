import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import PendingActionsCard from '@/components/portal/home/PendingActionsCard.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
})

// 2026-08-28：親師訊息下架，原第一格「待回覆訊息」移除，剩 4 格。
const FULL_ACTIONS = {
  pending_substitute: 1,
  pending_swap: 0,
  pending_anomaly_confirms: 3,
  unread_announcements: 5,
}

function mountIt(actions = FULL_ACTIONS) {
  return mount(PendingActionsCard, {
    props: { actions },
    global: { plugins: [router] },
  })
}

describe('PendingActionsCard', () => {
  it('renders 4 tiles in correct order', () => {
    const w = mountIt()
    const tiles = w.findAll('.action-tile')
    expect(tiles.length).toBe(4)
    expect(tiles[0].text()).toContain('待回應代理')
    expect(tiles[1].text()).toContain('待回應換班')
    expect(tiles[2].text()).toContain('異常待確認')
    expect(tiles[3].text()).toContain('未讀公告')
  })

  it('不再有「待回覆訊息」格', () => {
    const w = mountIt({ unread_messages: 9 })
    expect(w.text()).not.toContain('待回覆訊息')
    expect(w.findAll('.action-tile').length).toBe(4)
  })

  it('renders count from actions prop', () => {
    const w = mountIt()
    const tiles = w.findAll('.action-tile')
    expect(tiles[0].text()).toContain('1')
    expect(tiles[2].text()).toContain('3')
    expect(tiles[3].text()).toContain('5')
  })

  it('marks tile as is-empty when count is 0', () => {
    const w = mountIt()
    const tiles = w.findAll('.action-tile')
    // pending_swap = 0 → is-empty
    expect(tiles[1].classes()).toContain('is-empty')
    // pending_substitute = 1 → not is-empty
    expect(tiles[0].classes()).not.toContain('is-empty')
  })

  it('clicking tile pushes to correct route', async () => {
    const push = vi.spyOn(router, 'push')
    const w = mountIt()
    const tiles = w.findAll('.action-tile')
    // tiles[0] = pending_substitute → '/portal/leave'
    await tiles[0].trigger('click')
    expect(push).toHaveBeenCalledWith('/portal/leave')
  })

  it('handles missing actions prop fields gracefully', () => {
    const w = mountIt({})
    const tiles = w.findAll('.action-tile')
    expect(tiles.length).toBe(4)
    tiles.forEach((t) => {
      expect(t.text()).toMatch(/\b0\b/)
      expect(t.classes()).toContain('is-empty')
    })
  })

  it('applies tint class to count circle', () => {
    const w = mountIt()
    const counts = w.findAll('.tile-count')
    expect(counts[0].classes()).toContain('tint-leave')
    expect(counts[1].classes()).toContain('tint-calendar')
    // tiles[2] and tiles[3] both use tint-announcement
    expect(counts[2].classes()).toContain('tint-announcement')
    expect(counts[3].classes()).toContain('tint-announcement')
  })
})
