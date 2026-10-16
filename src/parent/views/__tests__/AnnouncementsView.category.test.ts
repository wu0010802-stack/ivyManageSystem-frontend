/**
 * AnnouncementsView / AnnouncementsPanel — 公告分類徽章（2026-09-08 首頁改版）。
 *
 * 公告新增分類（後端 schemas/announcement_categories.py::AnnouncementCategoryBriefOut：
 * id/name/icon/color），清單每則要顯示分類徽章（icon + name）；無分類的舊資料
 * 不應渲染徽章或報錯。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { mockListAnnouncements, mockGetUnreadCount, mockMarkRead } = vi.hoisted(() => ({
  mockListAnnouncements: vi.fn(),
  mockGetUnreadCount: vi.fn(),
  mockMarkRead: vi.fn(),
}))

vi.mock('@/parent/api/announcements', () => ({
  listAnnouncements: mockListAnnouncements,
  getUnreadCount: mockGetUnreadCount,
  markRead: mockMarkRead,
}))

vi.mock('@/parent/utils/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import AnnouncementsView from '../AnnouncementsView.vue'

const STUBS = {
  PullToRefresh: { template: '<div class="ptr"><slot /></div>' },
  SkeletonBlock: true,
  EmptyState: true,
  KawaiiStar: true,
  AnnouncementDetailModal: true,
}

function makeItem(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    priority: 'normal',
    is_read: false,
    created_at: '2026-01-01 10:00',
    title: `公告 ${id}`,
    ...overrides,
  }
}

beforeEach(() => {
  mockListAnnouncements.mockReset()
  mockGetUnreadCount.mockReset().mockResolvedValue({ data: { unread_count: 0 } })
  mockMarkRead.mockReset().mockResolvedValue({ data: {} })
})

describe('AnnouncementsView — 分類徽章', () => {
  it('有分類的公告顯示分類 icon 與名稱', async () => {
    mockListAnnouncements.mockResolvedValueOnce({
      data: {
        items: [makeItem(1, { category: { id: 1, name: '行政', icon: 'campaign', color: '#0d9053' } })],
        total: 1,
      },
    })
    const wrapper = mount(AnnouncementsView, { global: { stubs: STUBS } })
    await flushPromises()

    const badge = wrapper.find('.ann-cat')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toContain('行政')
    expect(badge.text()).toContain('campaign')
  })

  it('無分類（category 為 null，舊資料）不渲染分類徽章、不報錯', async () => {
    mockListAnnouncements.mockResolvedValueOnce({
      data: { items: [makeItem(1, { category: null })], total: 1 },
    })
    const wrapper = mount(AnnouncementsView, { global: { stubs: STUBS } })
    await flushPromises()

    expect(wrapper.find('.ann-cat').exists()).toBe(false)
    expect(wrapper.find('.ann-card').exists()).toBe(true)
  })
})
