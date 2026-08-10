/**
 * AdminListView 待辦徽章測試
 *
 * 重整前「事務」頁是 6 個純文字項目，家長不點進去就不知道有沒有事要處理
 * （Nielsen #6 recognition rather than recall 直接失分）。所有數字其實
 * home/summary 一支就有，只是前端沒接。
 *
 * 涵蓋：
 *  - 五項徽章各自取對欄位
 *  - 數字為 0 不渲染徽章（不要出現「0 筆」）
 *  - 逾期款項走 alert 色；今日用藥單是資訊性走 info 色
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

const summaryRef = ref<Record<string, unknown> | null>(null)
vi.mock('@/composables/useCachedAsync', () => ({
  useCachedAsync: () => ({
    data: summaryRef,
    error: ref(null),
    pending: ref(false),
    refresh: vi.fn(),
  }),
}))

vi.mock('@/parent/api/profile', () => ({ getHomeSummary: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/parent/stores/children', () => ({
  useChildrenStore: () => ({
    items: [{ student_id: 1, name: '小明' }],
    load: vi.fn().mockResolvedValue(undefined),
  }),
}))

import AdminListView from '@/parent/views/AdminListView.vue'

function setSummary(overrides: Record<string, unknown> = {}) {
  summaryRef.value = {
    summary: {
      unread_announcements: 0,
      unread_messages: 0,
      fees: { outstanding_count: 0, overdue: 0 },
      pending_event_acks: 0,
      pending_activity_promotions: 0,
      recent_leave_reviews: 0,
      active_medication_orders: 0,
      ...overrides,
    },
  }
}

/** 依項目標題找到那一列的徽章元素 */
function badgeOf(wrapper: ReturnType<typeof mount>, headline: string) {
  const row = wrapper
    .findAll('li')
    .find((li) => li.text().includes(headline))
  if (!row) throw new Error(`找不到列：${headline}`)
  const badge = row.find('.admin-badge')
  return badge.exists() ? badge : null
}

beforeEach(() => {
  setSummary()
})

describe('AdminListView 待辦徽章', () => {
  it('數字為 0 時不渲染任何徽章', () => {
    const w = mount(AdminListView)
    expect(w.findAll('.admin-badge').length).toBe(0)
    w.unmount()
  })

  it('假單審核結果顯示在「請假」列', () => {
    setSummary({ recent_leave_reviews: 2 })
    const w = mount(AdminListView)
    expect(badgeOf(w, '請假')?.text()).toBe('2')
    w.unmount()
  })

  it('待繳筆數顯示在「繳費」列，無逾期時走 action 色', () => {
    setSummary({ fees: { outstanding_count: 3, overdue: 0 } })
    const w = mount(AdminListView)
    const badge = badgeOf(w, '繳費')
    expect(badge?.text()).toBe('3')
    expect(badge?.classes()).toContain('admin-badge-action')
    expect(badge?.classes()).not.toContain('admin-badge-alert')
    w.unmount()
  })

  it('有逾期款項時「繳費」徽章轉 alert 色', () => {
    setSummary({ fees: { outstanding_count: 3, overdue: 1200 } })
    const w = mount(AdminListView)
    expect(badgeOf(w, '繳費')?.classes()).toContain('admin-badge-alert')
    w.unmount()
  })

  it('今日用藥單是資訊性，走 info 色而非待辦色', () => {
    setSummary({ active_medication_orders: 1 })
    const w = mount(AdminListView)
    const badge = badgeOf(w, '用藥委託')
    expect(badge?.text()).toBe('1')
    expect(badge?.classes()).toContain('admin-badge-info')
    expect(badge?.classes()).not.toContain('admin-badge-action')
    w.unmount()
  })

  it('才藝候補待確認與待簽份數各自顯示', () => {
    setSummary({ pending_activity_promotions: 1, pending_event_acks: 4 })
    const w = mount(AdminListView)
    expect(badgeOf(w, '課後才藝')?.text()).toBe('1')
    expect(badgeOf(w, '待簽紀錄')?.text()).toBe('4')
    w.unmount()
  })

  it('徽章帶 aria-label 說明數字語意，不讓螢幕閱讀器只念到裸數字', () => {
    setSummary({ pending_event_acks: 4 })
    const w = mount(AdminListView)
    expect(badgeOf(w, '待簽紀錄')?.attributes('aria-label')).toBe('4 份待簽')
    w.unmount()
  })
})
