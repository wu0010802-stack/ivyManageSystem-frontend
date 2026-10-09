/**
 * TodayView 聯絡簿請求競態（A10）回歸測試
 *
 * 2026-10-08 首頁改版後每位孩子各有一張狀態卡，聯絡簿改為「一輪」同時抓全部
 * 孩子（Promise.all），以 generation 比對只套用最新一輪的結果。原 A10 的
 * 風險型態（較舊的慢回應覆寫較新的結果）改出現在「掛載那輪還在飛行中時下拉
 * 刷新」：
 *  - 較舊一輪晚回來不得覆寫較新一輪（RED：沒有 generation guard 時會被蓋掉）
 *  - cache-hit 掛載時每位孩子只發一次請求（不因 watch + 掛載重複觸發）
 *  - 正常情況多寶聯絡簿各自正確載入
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

// ── 可控 mock：聯絡簿 API（以 deferred 控制回應時序） ─────────────────────────
interface CbResult {
  data: { entry: { id: number } | null }
}
interface PendingCall {
  sid: number
  resolve: (v: CbResult) => void
  reject: (e: unknown) => void
  settled: boolean
}
const cbCalls: PendingCall[] = []
const getTodayContactBookMock = vi.fn((sid: number) => {
  return new Promise<CbResult>((resolve, reject) => {
    cbCalls.push({ sid, resolve, reject, settled: false })
  })
})
vi.mock('@/parent/api/contactBook', () => ({
  getTodayContactBook: (...args: [number, unknown?]) => getTodayContactBookMock(...args),
}))

// ── 可控 mock：home summary（提供權威子女清單 A/B） ──────────────────────────
const summaryDataRef = ref<{
  me: { can_push: boolean }
  children: Array<{ student_id: number; name: string; classroom_name: string }>
  summary: { fees: null; pending_event_acks: number }
} | null>(null)
const summaryErrorRef = ref<unknown>(null)
const summaryPendingRef = ref(false)
const refreshSummaryMock = vi.fn()
vi.mock('@/composables/useCachedAsync', () => ({
  useCachedAsync: (key: string) => (key === 'parent/today/summary'
    ? { data: summaryDataRef, error: summaryErrorRef, pending: summaryPendingRef, refresh: refreshSummaryMock }
    : { data: ref(0), error: ref(null), pending: ref(false), refresh: vi.fn() }),
}))
vi.mock('@/parent/api/signDocuments', () => ({ listMySignRequests: vi.fn() }))
vi.mock('@/parent/api/pickup', () => ({ listPickupAuthorizations: vi.fn() }))

// ── 其餘 composable / API：靜態 stub（不影響競態邏輯） ────────────────────────
// 娃娃車入口卡在 mount 時會抓一次今日快照；本檔測聯絡簿競態，回無班次即可。
vi.mock('@/parent/api/bus', () => ({
  getBusToday: vi.fn().mockResolvedValue({
    data: { trip: null, position: null, stale: false, school: null, children: [] },
  }),
  // FE-PARENT-04 起 TodayView 也 import 這三支。不列出來的話 vitest 會在**呼叫時**
  // 丟「No "getRideCancellations" export is defined on the mock」，正好被
  // `loadRideCancellations()` 自己的 catch 吞掉——測試照樣綠，但綠的理由是錯的
  // （新的載入路徑整段沒被走到）。
  getRideCancellations: vi.fn().mockResolvedValue({
    data: { date: '2026-08-26', children: [] },
  }),
  createRideCancellation: vi.fn(),
  revokeRideCancellation: vi.fn(),
}))

vi.mock('@/parent/composables/useTodayStatusCache', () => ({
  useTodayStatusCache: () => ({ status: ref(null), refresh: vi.fn() }),
}))
vi.mock('@/parent/composables/useTodayTimeline', () => ({
  useTodayTimeline: () => ({ buckets: ref([]) }),
}))
vi.mock('@/parent/api/profile', () => ({
  getHomeSummary: vi.fn(),
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import { clearChildSelection } from '@/parent/composables/useChildSelection'

/** 依發出順序 resolve 某 sid 最早一筆尚未 settle 的請求 */
function resolveCb(sid: number, entry: { id: number } | null): void {
  const call = cbCalls.find((c) => c.sid === sid && !c.settled)
  if (!call) throw new Error(`無 in-flight 的聯絡簿請求 sid=${sid}`)
  call.settled = true
  call.resolve({ data: { entry } })
}

beforeEach(() => {
  clearChildSelection()
  try {
    localStorage.clear()
  } catch {
    /* happy-dom 有 localStorage，防呆 */
  }
  cbCalls.length = 0
  getTodayContactBookMock.mockClear()
  summaryDataRef.value = {
    me: { can_push: true },
    children: [
      { student_id: 1, name: '小明', classroom_name: '向日葵班' },
      { student_id: 2, name: '小華', classroom_name: '玫瑰班' },
    ],
    summary: { fees: null, pending_event_acks: 0 },
  }
})

type Vm = {
  contactBooks: Record<number, { id: number } | null>
  pullRefresh: () => Promise<void>
}

describe('TodayView — 聯絡簿請求競態（A10）', () => {
  it('掛載那輪還在飛行中時下拉刷新：較舊一輪晚回來不得覆寫較新一輪', async () => {
    const TodayView = (await import('@/parent/views/TodayView.vue')).default
    const wrapper = shallowMount(TodayView)
    await flushPromises()

    // 第一輪：兩位孩子各一支，皆 in-flight
    expect(cbCalls.map((c) => c.sid)).toEqual([1, 2])

    // 第一輪未回來前下拉刷新 → 第二輪
    const vm = wrapper.vm as unknown as Vm
    const refreshing = vm.pullRefresh()
    await flushPromises()
    expect(cbCalls.map((c) => c.sid)).toEqual([1, 2, 1, 2])

    // 第二輪（較新）先回來——resolveCb 取最早未 settle 的，所以先把第一輪標成待會才 resolve
    const [round1a, round1b, round2a, round2b] = cbCalls
    round2a.settled = true
    round2a.resolve({ data: { entry: { id: 101 } } })
    round2b.settled = true
    round2b.resolve({ data: { entry: { id: 201 } } })
    await refreshing
    await flushPromises()
    expect(vm.contactBooks[1]?.id).toBe(101)

    // 第一輪（較舊）才慢回來，不得覆寫
    round1a.settled = true
    round1a.resolve({ data: { entry: { id: 100 } } })
    round1b.settled = true
    round1b.resolve({ data: { entry: { id: 200 } } })
    await flushPromises()

    expect(vm.contactBooks[1]?.id).toBe(101)
    expect(vm.contactBooks[2]?.id).toBe(201)

    wrapper.unmount()
  })

  it('cache-hit 掛載：每位孩子只發一次請求（watch 與掛載不重複觸發）', async () => {
    const TodayView = (await import('@/parent/views/TodayView.vue')).default
    const wrapper = shallowMount(TodayView)
    await flushPromises()

    expect(getTodayContactBookMock.mock.calls.filter((c) => c[0] === 1).length).toBe(1)
    expect(getTodayContactBookMock.mock.calls.filter((c) => c[0] === 2).length).toBe(1)

    wrapper.unmount()
  })

  it('正常情況：多寶聯絡簿各自正確載入', async () => {
    const TodayView = (await import('@/parent/views/TodayView.vue')).default
    const wrapper = shallowMount(TodayView)
    await flushPromises()

    resolveCb(1, { id: 100 })
    resolveCb(2, null)
    await flushPromises()

    const vm = wrapper.vm as unknown as Vm
    expect(vm.contactBooks[1]?.id).toBe(100)
    expect(vm.contactBooks[2]).toBeNull()

    wrapper.unmount()
  })
})
