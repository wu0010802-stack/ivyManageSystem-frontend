/**
 * 「待辦」tab（AdminListView，路由 /admin；2026-10-08 由「事務」改版）。
 *
 * 兩段：待處理（與首頁同一支 HomeTodoList／useParentTodos，固定順序）／所有服務
 * （parentServices 固定入口）。
 *
 * F5 三態（沿用）：/parent/home/summary 失敗時不可把計數 fallback 成 0 讓家長
 * 誤以為「都處理完了」（含逾期款項）——首次載入的 pending 顯示骨架、error 顯示
 * 可重試的錯誤態、都不顯示「目前沒有要處理的事」；「所有服務」是靜態入口，不受影響。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

const summaryData = ref<Record<string, unknown> | null>(null)
const summaryError = ref<unknown>(null)
const summaryPending = ref(false)
const refreshSummary = vi.fn()
const signDocsData = ref<Record<string, unknown> | null>(null)
const pickupData = ref<Record<string, unknown> | null>(null)

vi.mock('@/composables/useCachedAsync', () => ({
  useCachedAsync: (key: string) => {
    if (key === 'parent/sign-requests/mine') {
      return { data: signDocsData, error: ref(null), pending: ref(false), refresh: vi.fn() }
    }
    if (key === 'parent/pickup/active') {
      return { data: pickupData, error: ref(null), pending: ref(false), refresh: vi.fn() }
    }
    return { data: summaryData, error: summaryError, pending: summaryPending, refresh: refreshSummary }
  },
}))

vi.mock('@/parent/api/profile', () => ({ getHomeSummary: vi.fn() }))
vi.mock('@/parent/api/signDocuments', () => ({ listMySignRequests: vi.fn() }))
vi.mock('@/parent/api/pickup', () => ({ listPickupAuthorizations: vi.fn() }))

import AdminListView from '@/parent/views/AdminListView.vue'
import { ALL_SERVICES_ORDER, PARENT_SERVICES } from '@/parent/utils/parentServices'

function summary(over: Record<string, unknown> = {}) {
  return {
    summary: {
      unread_announcements: 0,
      fees: { outstanding: 0, outstanding_count: 0, overdue: 0 },
      pending_event_acks: 0,
      pending_activity_promotions: 0,
      pending_survey_count: 0,
      recent_leave_reviews: 0,
      active_medication_orders: 0,
      ...over,
    },
  }
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

const rowKeys = (w: ReturnType<typeof mountView>) =>
  w.findAll('[data-testid^="home-todo-row-"]').map((n) => n.attributes('data-testid')!.replace('home-todo-row-', ''))

beforeEach(() => {
  summaryData.value = null
  summaryError.value = null
  summaryPending.value = false
  signDocsData.value = null
  pickupData.value = null
  refreshSummary.mockReset()
})

describe('AdminListView 三態（F5）', () => {
  it('pending 且尚無資料：顯示骨架，不顯示「目前沒有要處理的事」', () => {
    summaryPending.value = true
    const w = mountView()
    expect(w.findComponent({ name: 'SkeletonBlock' }).exists()).toBe(true)
    expect(w.text()).not.toContain('目前沒有要處理的事')
  })

  it('error 且尚無資料：顯示可重試錯誤態，按重試重新抓 summary', async () => {
    summaryError.value = new Error('boom')
    const w = mountView()
    const retry = w.findComponent({ name: 'MobileErrorRetry' })
    expect(retry.exists()).toBe(true)
    expect(w.text()).not.toContain('目前沒有要處理的事')
    await retry.vm.$emit('retry')
    expect(refreshSummary).toHaveBeenCalledWith(true)
  })

  it('有資料但全為 0：明確顯示「目前沒有要處理的事」', () => {
    summaryData.value = summary()
    const w = mountView()
    expect(w.find('[data-testid="home-todo-empty"]').text()).toContain('目前沒有要處理的事')
  })
})

describe('AdminListView 待處理', () => {
  it('標題為「待處理」，列依 useParentTodos 固定順序、名稱取自 parentServices', () => {
    summaryData.value = summary({
      fees: { outstanding: 8500, outstanding_count: 3, overdue: 1200 },
      pending_event_acks: 1,
      pending_survey_count: 2,
    })
    signDocsData.value = { pending: [{ id: 1 }] }
    pickupData.value = { items: [{ id: 9 }] }
    const w = mountView()
    expect(w.text()).toContain('待處理')
    expect(rowKeys(w)).toEqual(['fees', 'signDocs', 'eventAcks', 'surveys', 'pickup'])
    const fees = w.find('[data-testid="home-todo-row-fees"]')
    expect(fees.text()).toContain('繳費')
    expect(fees.text()).toContain('逾期')
    expect(fees.classes()).toContain('tone-alert')
    expect(w.find('[data-testid="home-todo-row-eventAcks"]').text()).toContain('簽收通知')
    expect(w.find('[data-testid="home-todo-row-signDocs"]').text()).toContain('簽署入學文件')
  })
})

describe('AdminListView 所有服務', () => {
  it('依 ALL_SERVICES_ORDER 列出每個服務，名稱與路由取自 parentServices', () => {
    summaryData.value = summary()
    const w = mountView()
    const tiles = w.findAll('[data-service]')
    expect(tiles.map((t) => t.attributes('data-service'))).toEqual([...ALL_SERVICES_ORDER])
    const fees = w.find('[data-service="fees"]')
    expect(fees.text()).toContain(PARENT_SERVICES.fees.label)
    expect(fees.attributes('href')).toBe(PARENT_SERVICES.fees.route)
    expect(w.find('[data-service="announce"]').attributes('href')).toBe('/announcements')
  })

  it('summary 失敗時「所有服務」照常顯示（靜態入口）', () => {
    summaryError.value = new Error('boom')
    const w = mountView()
    expect(w.findAll('[data-service]').length).toBe(ALL_SERVICES_ORDER.length)
  })

  it('今天有用藥單：用藥委託格副標改為「今天 N 張用藥單」，不進待處理', () => {
    summaryData.value = summary({ active_medication_orders: 2 })
    const w = mountView()
    expect(w.find('[data-service="medications"]').text()).toContain('今天 2 張用藥單')
    expect(rowKeys(w)).toEqual([])
  })
})
