/**
 * 「待辦」tab（AdminListView，路由 /admin；2026-10-08 由「事務」改版）。
 *
 * 三段：待處理（buildPendingItems，依急迫度排序）／進行中（今日用藥單、臨時
 * 接送授權）／所有服務（parentServices 固定入口）。
 *
 * F5 三態（沿用）：/parent/home/summary 失敗時不可把計數 fallback 成 0 讓家長
 * 誤以為「都處理完了」（含逾期款項）——首次載入的 pending 顯示骨架、error 顯示
 * 可重試的錯誤態；「所有服務」是靜態入口，不受影響。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

const dataRef = ref<Record<string, unknown> | null>(null)
const errorRef = ref<unknown>(null)
const pendingRef = ref(false)
const refreshMock = vi.fn()
const enrollDocsRef = ref<number | null>(0)
const pickupActiveRef = ref<number | null>(0)

vi.mock('@/composables/useCachedAsync', () => ({
  useCachedAsync: (key: string) => {
    if (key === 'parent/pending/enroll-docs') {
      return { data: enrollDocsRef, error: ref(null), pending: ref(false), refresh: vi.fn() }
    }
    if (key === 'parent/pending/pickup-active') {
      return { data: pickupActiveRef, error: ref(null), pending: ref(false), refresh: vi.fn() }
    }
    return { data: dataRef, error: errorRef, pending: pendingRef, refresh: refreshMock }
  },
}))

vi.mock('@/parent/api/profile', () => ({ getHomeSummary: vi.fn() }))
vi.mock('@/parent/api/signDocuments', () => ({ listMySignRequests: vi.fn() }))
vi.mock('@/parent/api/pickup', () => ({ listPickupAuthorizations: vi.fn() }))

import AdminListView from '@/parent/views/AdminListView.vue'

const SUMMARY = {
  summary: {
    unread_announcements: 2,
    fees: { outstanding: 8500, outstanding_count: 3, overdue: 1200 },
    pending_event_acks: 1,
    pending_activity_promotions: 0,
    pending_survey_count: 1,
    recent_leave_reviews: 0,
    active_medication_orders: 0,
  },
}

function mountView() {
  return mount(AdminListView, {
    global: {
      stubs: {
        RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
      },
    },
  })
}

beforeEach(() => {
  dataRef.value = null
  errorRef.value = null
  pendingRef.value = false
  enrollDocsRef.value = 0
  pickupActiveRef.value = 0
  refreshMock.mockReset()
})

describe('AdminListView 三態（F5）', () => {
  it('pending 且尚無資料：顯示骨架，不渲染待處理清單（不出現誤導性的「沒有待辦」）', () => {
    pendingRef.value = true
    const w = mountView()
    expect(w.findComponent({ name: 'SkeletonBlock' }).exists()).toBe(true)
    expect(w.findAll('[data-pending]').length).toBe(0)
    expect(w.text()).not.toContain('目前沒有要處理的事')
  })

  it('error 且尚無資料：顯示 MobileErrorRetry，按重試會重新抓 summary', async () => {
    errorRef.value = { displayMessage: '網路錯誤' }
    const w = mountView()
    const errComp = w.findComponent({ name: 'MobileErrorRetry' })
    expect(errComp.exists()).toBe(true)
    expect(w.text()).not.toContain('目前沒有要處理的事')
    await errComp.find('button').trigger('click')
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('error 時「所有服務」仍可用（靜態入口不受 summary 失敗影響）', () => {
    errorRef.value = { displayMessage: '網路錯誤' }
    const w = mountView()
    expect(w.findAll('[data-service]').length).toBe(12)
  })

  it('已有資料時背景 refresh 又 pending：清單持續顯示', () => {
    dataRef.value = SUMMARY
    pendingRef.value = true
    const w = mountView()
    expect(w.findComponent({ name: 'SkeletonBlock' }).exists()).toBe(false)
    expect(w.findAll('[data-pending]').length).toBeGreaterThan(0)
  })
})

describe('AdminListView 待處理', () => {
  it('依急迫度排序：逾期繳費 → 簽收通知 → 入學文件 → 活動調查 → 公告', () => {
    dataRef.value = SUMMARY
    enrollDocsRef.value = 1
    const w = mountView()
    const keys = w.findAll('[data-pending]').map((n) => n.attributes('data-pending'))
    expect(keys).toEqual(['fees', 'acks', 'enrollDocs', 'surveys', 'announcements'])
  })

  it('逾期款項帶 urgent 樣式與逾期金額，入口連到 /fees', () => {
    dataRef.value = SUMMARY
    const w = mountView()
    const fees = w.find('[data-pending="fees"]')
    expect(fees.classes()).toContain('tone-urgent')
    expect(fees.text()).toContain('逾期 NT$1,200')
    expect(fees.attributes('href')).toBe('/fees')
  })

  it('標題旁的數字只算待辦（公告是資訊性，不計入）', () => {
    dataRef.value = SUMMARY
    const w = mountView()
    expect(w.find('.pi-count').text()).toBe('3')
  })

  it('沒有任何待辦：顯示安心文案', () => {
    dataRef.value = { summary: {} }
    const w = mountView()
    expect(w.findAll('[data-pending]').length).toBe(0)
    expect(w.text()).toContain('目前沒有要處理的事')
  })
})

describe('AdminListView 進行中', () => {
  it('沒有用藥單與接送授權：不渲染進行中段', () => {
    dataRef.value = SUMMARY
    const w = mountView()
    expect(w.text()).not.toContain('進行中')
  })

  it('今日用藥單與臨時接送授權：列在進行中（資訊性，不進待處理）', () => {
    dataRef.value = { summary: { active_medication_orders: 2 } }
    pickupActiveRef.value = 1
    const w = mountView()
    expect(w.text()).toContain('進行中')
    expect(w.find('[data-pending="medications"]').text()).toContain('今天有 2 張用藥單')
    expect(w.find('[data-pending="pickupAuth"]').text()).toContain('1 筆授權進行中')
    expect(w.find('[data-pending="medications"]').classes()).toContain('tone-info')
  })
})

describe('AdminListView 所有服務', () => {
  it('12 個固定入口，名稱統一（含先前找不到入口的入學文件、出席紀錄、常見問題）', () => {
    dataRef.value = SUMMARY
    const w = mountView()
    const labels = w.findAll('.svc-label').map((n) => n.text())
    expect(labels).toEqual([
      '請假', '繳費', '用藥委託', '預告接送', '臨時接送', '簽收通知',
      '入學文件', '活動調查', '課後才藝', '出席紀錄', '行事曆', '常見問題',
    ])
  })

  it('每格連到對應路由', () => {
    dataRef.value = SUMMARY
    const w = mountView()
    expect(w.find('[data-service="enrollDocs"]').attributes('href')).toBe('/sign')
    expect(w.find('[data-service="sign"]').attributes('href')).toBe('/events')
    expect(w.find('[data-service="assistant"]').attributes('href')).toBe('/assistant')
    expect(w.find('[data-service="attendance"]').attributes('href')).toBe('/attendance')
  })
})
