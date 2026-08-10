/**
 * TodayView 娃娃車小卡請求競態回歸測試
 *
 * Bug：loadBusToday() 沒有 request-sequence guard，下拉刷新（pullRefresh）與
 * 重試（refresh）重疊觸發時，較舊的回應可能晚到覆蓋較新的回應，讓首頁「還有
 * N 站」小卡短暫顯示過期資訊。修法比照同檔 loadContactBook 的 seq guard：
 * 只套用最新一次呼叫的結果，較舊回應（含錯誤）一律丟棄。
 *
 * 涵蓋：
 *  - 重疊觸發 loadBusToday（mount 一次 + 下拉刷新一次），較舊回應（mount 那次）
 *    晚到時不得覆寫較新回應（下拉刷新那次）（RED：舊碼無 guard，最後 resolve
 *    的請求勝出，不論發出順序）
 *  - 正常情況娃娃車小卡正確載入（無競態行為不變）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

// ── 可控 mock：娃娃車 API（以 deferred 控制回應時序） ─────────────────────────
interface BusResult {
  data: {
    trip: { status: string } | null
    children: { stop_status?: string; stops_ahead?: number }[]
  }
}
interface PendingCall {
  resolve: (v: BusResult) => void
  reject: (e: unknown) => void
  settled: boolean
}
const busCalls: PendingCall[] = []
const getBusTodayMock = vi.fn(() => {
  return new Promise<BusResult>((resolve, reject) => {
    busCalls.push({ resolve, reject, settled: false })
  })
})
vi.mock('@/parent/api/bus', () => ({
  getBusToday: (...args: unknown[]) => getBusTodayMock(...args),
}))

// ── 可控 mock：home summary（提供權威子女清單，避免其他分支噪音） ────────────
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

// ── 其餘 composable / API：靜態 stub（不影響娃娃車競態邏輯） ──────────────────
vi.mock('@/parent/api/contactBook', () => ({
  getTodayContactBook: vi.fn().mockResolvedValue({ data: { entry: null } }),
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

function resolveBus(index: number, result: BusResult): void {
  const call = busCalls[index]
  if (!call || call.settled) throw new Error(`無 in-flight 的娃娃車請求 index=${index}`)
  call.settled = true
  call.resolve(result)
}

beforeEach(() => {
  clearChildSelection()
  try {
    localStorage.clear()
  } catch {
    /* happy-dom 有 localStorage，防呆 */
  }
  busCalls.length = 0
  getBusTodayMock.mockClear()
  summaryDataRef.value = {
    me: { can_push: true },
    children: [{ student_id: 1, name: '小明', classroom_name: '向日葵班' }],
    summary: { fees: null, pending_event_acks: 0 },
  }
})

type Vm = { busTileValue: string }

describe('TodayView — 娃娃車小卡請求競態', () => {
  it('重疊觸發時，較舊（mount）回應晚到不得覆寫較新（下拉刷新）回應', async () => {
    const TodayView = (await import('@/parent/views/TodayView.vue')).default
    const wrapper = shallowMount(TodayView)
    await flushPromises()

    // mount 時已對 loadBusToday 發出第一次請求（index 0，in-flight）
    expect(busCalls.length).toBe(1)

    // 第一次仍 in-flight 時，觸發下拉刷新（PullToRefresh 的 on-refresh prop）
    // 發出第二次請求（index 1）
    const pullToRefreshStub = wrapper.findComponent({ name: 'PullToRefresh' })
    const onRefresh = pullToRefreshStub.props('onRefresh') as () => Promise<unknown>
    const pullPromise = onRefresh()
    await flushPromises()
    expect(busCalls.length).toBe(2)

    // 較新（下拉刷新）的請求先回來：目前 3 站
    resolveBus(1, {
      data: { trip: { status: 'in_progress' }, children: [{ stop_status: 'pending', stops_ahead: 3 }] },
    })
    await flushPromises()

    const vm = wrapper.vm as unknown as Vm
    expect(vm.busTileValue).toBe('還有 3 站')

    // 較舊（mount）的請求才慢慢回來：舊資料 7 站，不得覆寫上面的 3 站
    resolveBus(0, {
      data: { trip: { status: 'in_progress' }, children: [{ stop_status: 'pending', stops_ahead: 7 }] },
    })
    await flushPromises()
    await pullPromise.catch(() => undefined)

    expect(vm.busTileValue).toBe('還有 3 站')

    wrapper.unmount()
  })

  it('正常情況：娃娃車小卡正確載入（行為不變）', async () => {
    const TodayView = (await import('@/parent/views/TodayView.vue')).default
    const wrapper = shallowMount(TodayView)
    await flushPromises()

    resolveBus(0, {
      data: { trip: { status: 'in_progress' }, children: [{ stop_status: 'pending', stops_ahead: 2 }] },
    })
    await flushPromises()

    const vm = wrapper.vm as unknown as Vm
    expect(vm.busTileValue).toBe('還有 2 站')

    wrapper.unmount()
  })
})
