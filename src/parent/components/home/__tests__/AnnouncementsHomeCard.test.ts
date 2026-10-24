/**
 * AnnouncementsHomeCard — 首頁「公告」預覽卡（2026-09-08 首頁改版）。
 *
 * 涵蓋：
 *  - 只抓最新 3 則（limit:3）
 *  - 未讀左側實心圓點；已讀不畫（不是留白）
 *  - 分類徽章顯示 icon + name；無分類時不渲染徽章
 *  - meta 列相對時間帶「更新」字樣
 *  - 沒有公告／載入失敗：整卡不渲染
 *  - 「更多」連到 /announcements
 *  - D-26（2026-10-14）：有未讀才顯示完整卡；全部已讀縮成一行入口「公告（全部已讀）›」
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

  it('已讀公告不畫圓點（不是留白佔位）：同卡內一讀一未讀，只有未讀那列有圓點', async () => {
    mockListAnnouncements.mockResolvedValue({
      data: { items: [makeItem({ id: 1, is_read: true }), makeItem({ id: 2, is_read: false })], total: 2 },
    })
    const w = mount(AnnouncementsHomeCard, { global: { stubs } })
    await flushPromises()
    const rows = w.findAll('.ann-home-row')
    expect(rows.length).toBe(2)
    expect(rows[0].find('.ann-home-dot').exists()).toBe(false)
    expect(rows[1].find('.ann-home-dot').exists()).toBe(true)
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

  it('標題為服務名稱「公告」（與待辦「所有服務」、路由標題一致），「更多」連到 /announcements', async () => {
    mockListAnnouncements.mockResolvedValue({ data: { items: [makeItem()], total: 1 } })
    const w = mount(AnnouncementsHomeCard, { global: { stubs } })
    await flushPromises()
    expect(w.find('.pt-section-title').text()).toBe('公告')
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

describe('AnnouncementsHomeCard — 全部已讀縮成一行（D-26）', () => {
  const allRead = () => ({
    data: { items: [makeItem({ id: 1, is_read: true }), makeItem({ id: 2, is_read: true })], total: 2 },
  })

  it('最新幾則全部已讀：不渲染完整卡，改顯示一行入口「公告（全部已讀）」連到 /announcements', async () => {
    mockListAnnouncements.mockResolvedValue(allRead())
    const w = mount(AnnouncementsHomeCard, { global: { stubs } })
    await flushPromises()
    expect(w.find('[data-testid="ann-home-card"]').exists()).toBe(false)
    expect(w.findAll('.ann-home-row').length).toBe(0)
    const line = w.find('[data-testid="ann-home-collapsed"]')
    expect(line.exists()).toBe(true)
    expect(line.text()).toContain('公告（全部已讀）')
    expect(line.attributes('href')).toBe('/announcements')
  })

  it('有任何一則未讀：維持完整卡，不出現縮合入口', async () => {
    mockListAnnouncements.mockResolvedValue({
      data: { items: [makeItem({ id: 1, is_read: true }), makeItem({ id: 2, is_read: false })], total: 2 },
    })
    const w = mount(AnnouncementsHomeCard, { global: { stubs } })
    await flushPromises()
    expect(w.find('[data-testid="ann-home-card"]').exists()).toBe(true)
    expect(w.find('[data-testid="ann-home-collapsed"]').exists()).toBe(false)
  })

  it('最新幾則都已讀、但 summary 權威未讀數 > 0（較舊的未讀）：不可誤報「全部已讀」，維持完整卡', async () => {
    mockListAnnouncements.mockResolvedValue(allRead())
    const w = mount(AnnouncementsHomeCard, { global: { stubs }, props: { unreadTotal: 2 } })
    await flushPromises()
    expect(w.find('[data-testid="ann-home-card"]').exists()).toBe(true)
    expect(w.find('[data-testid="ann-home-collapsed"]').exists()).toBe(false)
  })

  it('權威未讀數為 0 且最新幾則全已讀：縮成一行', async () => {
    mockListAnnouncements.mockResolvedValue(allRead())
    const w = mount(AnnouncementsHomeCard, { global: { stubs }, props: { unreadTotal: 0 } })
    await flushPromises()
    expect(w.find('[data-testid="ann-home-collapsed"]').exists()).toBe(true)
  })

  it('下拉刷新期間（已有資料）不閃回骨架：縮合入口維持，refresh 完成後仍是縮合', async () => {
    mockListAnnouncements.mockResolvedValue(allRead())
    const w = mount(AnnouncementsHomeCard, { global: { stubs } })
    await flushPromises()
    let release: (v: unknown) => void = () => {}
    mockListAnnouncements.mockReturnValueOnce(new Promise((r) => { release = r }))
    const pending = (w.vm as unknown as { refresh: () => Promise<void> }).refresh()
    await w.vm.$nextTick()
    expect(w.find('[data-testid="ann-home-collapsed"]').exists()).toBe(true)
    expect(w.find('.ann-home-skeleton').exists()).toBe(false)
    release(allRead())
    await pending
    await flushPromises()
    expect(w.find('[data-testid="ann-home-collapsed"]').exists()).toBe(true)
  })

  it('首次載入中仍顯示骨架卡（沒有資料可判斷已讀與否）', async () => {
    let release: (v: unknown) => void = () => {}
    mockListAnnouncements.mockReturnValue(new Promise((r) => { release = r }))
    const w = mount(AnnouncementsHomeCard, { global: { stubs } })
    await w.vm.$nextTick()
    expect(w.find('[data-testid="ann-home-card"]').exists()).toBe(true)
    expect(w.find('.ann-home-skeleton').exists()).toBe(true)
    release(allRead())
    await flushPromises()
    expect(w.find('[data-testid="ann-home-collapsed"]').exists()).toBe(true)
  })

  it('載入失敗或沒有任何公告：既不顯示完整卡也不顯示縮合入口', async () => {
    mockListAnnouncements.mockResolvedValue({ data: { items: [], total: 0 } })
    const w = mount(AnnouncementsHomeCard, { global: { stubs } })
    await flushPromises()
    expect(w.find('[data-testid="ann-home-collapsed"]').exists()).toBe(false)
    expect(w.find('[data-testid="ann-home-card"]').exists()).toBe(false)
  })
})
