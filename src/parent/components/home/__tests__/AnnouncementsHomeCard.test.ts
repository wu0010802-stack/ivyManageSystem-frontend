/**
 * AnnouncementsHomeCard — 首頁「校園公告」預覽卡（2026-09-08 首頁改版）。
 *
 * 涵蓋：
 *  - 只抓最新 3 則（limit:3）
 *  - 未讀左側實心圓點；已讀不畫（不是留白）
 *  - 分類徽章顯示 icon + name；無分類時不渲染徽章
 *  - meta 列相對時間帶「更新」字樣
 *  - 沒有公告／載入失敗：整卡不渲染
 *  - 「更多」連到 /announcements
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const mockListAnnouncements = vi.hoisted(() => vi.fn())
vi.mock('@/parent/api/announcements', () => ({
  listAnnouncements: mockListAnnouncements,
}))

import AnnouncementsHomeCard from '@/parent/components/home/AnnouncementsHomeCard.vue'

const stubs = {
  'router-link': { props: ['to'], template: '<a :href="to"><slot /></a>' },
}

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: '運動會通知',
    is_read: false,
    created_at: '2026-01-01T10:00:00',
    category: { id: 1, name: '活動', icon: 'celebration', color: '#0d9053' },
    ...overrides,
  }
}

beforeEach(() => {
  mockListAnnouncements.mockReset()
})

describe('AnnouncementsHomeCard', () => {
  it('mount 時以 limit:3 抓最新公告', async () => {
    mockListAnnouncements.mockResolvedValue({ data: { items: [makeItem()], total: 1 } })
    mount(AnnouncementsHomeCard, { global: { stubs } })
    await flushPromises()
    expect(mockListAnnouncements).toHaveBeenCalledWith({ limit: 3 })
  })

  it('未讀公告左側顯示實心圓點', async () => {
    mockListAnnouncements.mockResolvedValue({
      data: { items: [makeItem({ is_read: false })], total: 1 },
    })
    const w = mount(AnnouncementsHomeCard, { global: { stubs } })
    await flushPromises()
    expect(w.find('.ann-home-dot').exists()).toBe(true)
  })

  it('已讀公告不畫圓點（不是留白佔位）', async () => {
    mockListAnnouncements.mockResolvedValue({
      data: { items: [makeItem({ is_read: true })], total: 1 },
    })
    const w = mount(AnnouncementsHomeCard, { global: { stubs } })
    await flushPromises()
    expect(w.find('.ann-home-dot').exists()).toBe(false)
  })

  it('顯示分類徽章的 icon 與名稱', async () => {
    mockListAnnouncements.mockResolvedValue({
      data: { items: [makeItem({ category: { id: 2, name: '行政', icon: 'campaign', color: '#2d6f8e' } })], total: 1 },
    })
    const w = mount(AnnouncementsHomeCard, { global: { stubs } })
    await flushPromises()
    const badge = w.find('.ann-home-cat')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toContain('行政')
    expect(badge.text()).toContain('campaign')
  })

  it('無分類時不渲染分類徽章', async () => {
    mockListAnnouncements.mockResolvedValue({
      data: { items: [makeItem({ category: null })], total: 1 },
    })
    const w = mount(AnnouncementsHomeCard, { global: { stubs } })
    await flushPromises()
    expect(w.find('.ann-home-cat').exists()).toBe(false)
  })

  it('meta 列的相對時間帶「更新」字樣', async () => {
    mockListAnnouncements.mockResolvedValue({
      data: { items: [makeItem({ created_at: new Date().toISOString() })], total: 1 },
    })
    const w = mount(AnnouncementsHomeCard, { global: { stubs } })
    await flushPromises()
    expect(w.find('.ann-home-time').text()).toContain('更新')
  })

  it('標題單行截斷（不換行顯示全文，靠 CSS ellipsis）', async () => {
    mockListAnnouncements.mockResolvedValue({
      data: { items: [makeItem({ title: '這是一則很長很長很長很長很長很長很長很長的公告標題' })], total: 1 },
    })
    const w = mount(AnnouncementsHomeCard, { global: { stubs } })
    await flushPromises()
    expect(w.find('.ann-home-title').exists()).toBe(true)
    expect(w.find('.ann-home-title').text()).toContain('這是一則')
  })

  it('沒有公告：整卡不渲染', async () => {
    mockListAnnouncements.mockResolvedValue({ data: { items: [], total: 0 } })
    const w = mount(AnnouncementsHomeCard, { global: { stubs } })
    await flushPromises()
    expect(w.find('[data-testid="ann-home-card"]').exists()).toBe(false)
  })

  it('載入失敗：不擋頁面，整卡不渲染', async () => {
    mockListAnnouncements.mockRejectedValue(new Error('boom'))
    const w = mount(AnnouncementsHomeCard, { global: { stubs } })
    await flushPromises()
    expect(w.find('[data-testid="ann-home-card"]').exists()).toBe(false)
  })

  it('標題含「校園公告」與「更多」連到 /announcements', async () => {
    mockListAnnouncements.mockResolvedValue({ data: { items: [makeItem()], total: 1 } })
    const w = mount(AnnouncementsHomeCard, { global: { stubs } })
    await flushPromises()
    expect(w.text()).toContain('校園公告')
    const more = w.find('.ann-home-more')
    expect(more.exists()).toBe(true)
    expect(more.attributes('href')).toBe('/announcements')
  })

  it('最多只渲染 3 則，即使後端多回一些', async () => {
    mockListAnnouncements.mockResolvedValue({
      data: { items: [makeItem({ id: 1 }), makeItem({ id: 2 }), makeItem({ id: 3 }), makeItem({ id: 4 })], total: 4 },
    })
    const w = mount(AnnouncementsHomeCard, { global: { stubs } })
    await flushPromises()
    expect(w.findAll('.ann-home-row').length).toBe(3)
  })
})
