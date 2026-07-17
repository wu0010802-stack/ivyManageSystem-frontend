/**
 * TodayView 聯絡簿請求競態（A10）回歸測試
 *
 * Bug：loadContactBook() 原本以 `if (contactBookLoading.value) return` 作守衛，
 * 方向錯誤——A 的請求還在飛行中時切到 B，B 會被丟棄且不重試，畫面卡在前一個
 * 孩子（A 慢回來還會覆蓋）。修法改用 request-sequence guard（只套用最新 sid 的
 * 回應）+ in-flight sid 去重（保留 mount 時同 sid 只發一次請求）。
 *
 * 涵蓋：
 *  - 快速切子女（A→B），A 較慢回應不得覆寫 B（RED：舊碼丟棄 B 的請求）
 *  - mount 時 onMounted 直呼 + watch 觸發同一 sid 只發一次請求（去重非回歸）
 *  - 正常情況聯絡簿正確載入（無競態行為不變）
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
  useCachedAsync: () => ({
    data: summaryDataRef,
    error: summaryErrorRef,
    pending: summaryPendingRef,
    refresh: refreshSummaryMock,
  }),
}))

// ── 其餘 composable / API：靜態 stub（不影響競態邏輯） ────────────────────────
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

import { useChildSelection, clearChildSelection } from '@/parent/composables/useChildSelection'

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

type Vm = { contactBookEntry: { id: number } | null }

describe('TodayView — 聯絡簿請求競態（A10）', () => {
  it('快速切子女時，較舊 sid 的慢回應不得覆寫最新選中子女的聯絡簿', async () => {
    const TodayView = (await import('@/parent/views/TodayView.vue')).default
    const wrapper = shallowMount(TodayView)
    await flushPromises()

    // 掛載時已對 child A(1) 發出聯絡簿請求（in-flight，尚未 resolve）
    expect(getTodayContactBookMock).toHaveBeenCalledWith(1)
    expect(cbCalls.filter((c) => c.sid === 1).length).toBe(1)

    // A 請求仍 in-flight 時快速切到 child B(2)
    const { setSelected } = useChildSelection()
    setSelected(2)
    await flushPromises()

    // 舊碼的 loading-guard 會把 B 的請求丟棄；修好後必須有對 sid=2 發出請求
    expect(getTodayContactBookMock).toHaveBeenCalledWith(2)

    // B（最新）較快回來
    resolveCb(2, { id: 200 })
    await flushPromises()

    // A（較舊）較慢才回來，不得覆寫 B
    resolveCb(1, { id: 100 })
    await flushPromises()

    const vm = wrapper.vm as unknown as Vm
    expect(vm.contactBookEntry?.id).toBe(200)

    wrapper.unmount()
  })

  it('掛載時 onMounted 直呼 + watch 觸發同一 sid 只發一次請求（去重保留）', async () => {
    const TodayView = (await import('@/parent/views/TodayView.vue')).default
    const wrapper = shallowMount(TodayView)
    await flushPromises()

    const callsForA = getTodayContactBookMock.mock.calls.filter((c) => c[0] === 1).length
    expect(callsForA).toBe(1)

    wrapper.unmount()
  })

  it('正常情況：選中子女的聯絡簿正確載入（行為不變）', async () => {
    const TodayView = (await import('@/parent/views/TodayView.vue')).default
    const wrapper = shallowMount(TodayView)
    await flushPromises()

    resolveCb(1, { id: 100 })
    await flushPromises()

    const vm = wrapper.vm as unknown as Vm
    expect(vm.contactBookEntry?.id).toBe(100)

    wrapper.unmount()
  })
})
