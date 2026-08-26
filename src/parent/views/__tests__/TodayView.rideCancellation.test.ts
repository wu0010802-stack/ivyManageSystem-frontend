/**
 * TodayView「今天不搭」入口整合測試（FE-PARENT-04，spec「家長端」第 1 點）。
 *
 * 涵蓋：
 *  - 入口顯示條件吃 `GET /parent/bus/ride-cancellations`，**不**吃
 *    `GET /parent/bus/today`——後者依 spec 排除 planned/expired，發車前一律回空，
 *    掛在它底下入口就只在車上路後才出現，早上接車永遠來不及報（本次落地的核心
 *    契約缺口，見 bussch07 migration docstring）。
 *  - 「整天」是單一 request 帶兩個 direction（後端逐方向跑 savepoint），不是兩次
 *    HTTP；部分成功時兩筆結果原樣交給 sheet 分筆呈現。
 *  - 送出／撤銷後重載列表。
 *  - 多子女逐一入口。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

type BusDirection = 'morning' | 'afternoon'
interface RideChild {
  student_id: number
  student_name: string
  scheduled_directions: BusDirection[]
  cancellations: Array<{ id: number; direction: BusDirection; revocable: boolean }>
}

let rideChildren: RideChild[] = []
const getRideCancellationsMock = vi.fn(() =>
  Promise.resolve({ data: { date: '2026-08-26', children: rideChildren } }),
)
const createRideCancellationMock = vi.fn()
const revokeRideCancellationMock = vi.fn()
// 娃娃車追蹤小卡：一律回「無班次」，證明入口的出現與它無關
const getBusTodayMock = vi.fn(() =>
  Promise.resolve({ data: { trip: null, children: [] } }),
)

vi.mock('@/parent/api/bus', () => ({
  getBusToday: (...a: unknown[]) => getBusTodayMock(...a),
  getRideCancellations: (...a: unknown[]) => getRideCancellationsMock(...a),
  createRideCancellation: (...a: unknown[]) => createRideCancellationMock(...a),
  revokeRideCancellation: (...a: unknown[]) => revokeRideCancellationMock(...a),
}))

const summaryDataRef = ref<Record<string, unknown> | null>(null)
vi.mock('@/composables/useCachedAsync', () => ({
  useCachedAsync: () => ({
    data: summaryDataRef,
    error: ref(null),
    pending: ref(false),
    refresh: vi.fn(),
  }),
}))
vi.mock('@/parent/api/contactBook', () => ({
  getTodayContactBook: vi.fn().mockResolvedValue({ data: { entry: null } }),
}))
vi.mock('@/parent/composables/useTodayStatusCache', () => ({
  useTodayStatusCache: () => ({ status: ref(null), refresh: vi.fn() }),
}))
vi.mock('@/parent/composables/useTodayTimeline', () => ({
  useTodayTimeline: () => ({ buckets: ref([]) }),
}))
vi.mock('@/parent/api/profile', () => ({ getHomeSummary: vi.fn() }))
vi.mock('@/parent/api/pickup', () => ({
  listPickupAuthorizations: vi.fn().mockResolvedValue({ data: { items: [] } }),
}))
vi.mock('@/parent/api/signDocuments', () => ({
  listMySignRequests: vi.fn().mockResolvedValue({ data: { pending: [] } }),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { clearChildSelection } from '@/parent/composables/useChildSelection'

const CHILD_A: RideChild = {
  student_id: 1,
  student_name: '王小明',
  scheduled_directions: ['morning', 'afternoon'],
  cancellations: [],
}

interface Vm {
  busRideChildren: RideChild[]
  cancelSheetChild: RideChild | null
  cancelResults: Array<{ direction: BusDirection; ok: boolean; message: string }> | null
  openCancelSheet: (studentId: number) => void
  closeCancelSheet: () => void
  onRideCancelSubmit: (directions: BusDirection[]) => Promise<void>
  onRideCancelRevoke: (id: number) => Promise<void>
  rideCancelSummary: (child: RideChild) => string | undefined
}

/**
 * `PullToRefresh` 不 stub：shallowMount 會把它連同 default slot 一起換成空殼，
 * 首頁整個 bento 區（含本檔要斷言的入口按鈕）根本不會進 DOM。其餘子元件維持
 * stub——我們要驗的是「入口有沒有被渲染出來」，不是 StatTile 內部長相。
 */
async function mountToday() {
  const TodayView = (await import('@/parent/views/TodayView.vue')).default
  const wrapper = shallowMount(TodayView, {
    global: { stubs: { PullToRefresh: false } },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  clearChildSelection()
  try {
    localStorage.clear()
  } catch {
    /* happy-dom 有 localStorage，防呆 */
  }
  rideChildren = [{ ...CHILD_A, cancellations: [] }]
  getRideCancellationsMock.mockClear()
  createRideCancellationMock.mockClear()
  revokeRideCancellationMock.mockClear()
  getBusTodayMock.mockClear()
  summaryDataRef.value = {
    me: { can_push: true },
    children: [{ student_id: 1, name: '王小明', classroom_name: '向日葵班' }],
    summary: { fees: null, pending_event_acks: 0 },
  }
})

describe('TodayView — 今天不搭入口顯示條件', () => {
  it('沒有進行中班次也要出現入口（發車前才是主要回報時段）', async () => {
    const wrapper = await mountToday()
    // getBusToday 回無班次 → 追蹤小卡不出現
    expect(wrapper.find('[data-testid="bus-ride-cancel-1"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('非搭車家庭（後端回空清單）不渲染入口', async () => {
    rideChildren = []
    const wrapper = await mountToday()
    expect(wrapper.find('[data-testid="bus-ride-cancel-1"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('多子女逐一給入口', async () => {
    rideChildren = [
      { ...CHILD_A },
      { student_id: 2, student_name: '王小美', scheduled_directions: ['afternoon'], cancellations: [] },
    ]
    const wrapper = await mountToday()
    expect(wrapper.find('[data-testid="bus-ride-cancel-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="bus-ride-cancel-2"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('已有申報時入口副標列出已回報的方向', async () => {
    rideChildren = [{
      ...CHILD_A,
      cancellations: [{ id: 5, direction: 'morning', revocable: true }],
    }]
    const wrapper = await mountToday()
    const vm = wrapper.vm as unknown as Vm
    expect(vm.rideCancelSummary(vm.busRideChildren[0])).toBe('早上接車已回報')
    wrapper.unmount()
  })

  it('列表載入失敗不擋首頁其他區塊，入口單純不出現', async () => {
    getRideCancellationsMock.mockRejectedValueOnce(new Error('boom'))
    const wrapper = await mountToday()
    expect(wrapper.find('[data-testid="bus-ride-cancel-1"]').exists()).toBe(false)
    // 首頁本體仍渲染
    expect(wrapper.findComponent({ name: 'PullToRefresh' }).exists()).toBe(true)
    wrapper.unmount()
  })
})

describe('TodayView — 今天不搭送出與撤銷', () => {
  it('「整天」以單一 request 帶兩個 direction（不是打兩次）', async () => {
    createRideCancellationMock.mockResolvedValue({
      data: {
        results: [
          { direction: 'morning', success: true, message: '已申報今天不搭，司機端已同步' },
          { direction: 'afternoon', success: true, message: '已申報今天不搭，司機端已同步' },
        ],
      },
    })
    const wrapper = await mountToday()
    const vm = wrapper.vm as unknown as Vm
    vm.openCancelSheet(1)
    await vm.onRideCancelSubmit(['morning', 'afternoon'])
    await flushPromises()

    expect(createRideCancellationMock).toHaveBeenCalledTimes(1)
    expect(createRideCancellationMock.mock.calls[0][0]).toMatchObject({
      student_id: 1,
      directions: ['morning', 'afternoon'],
    })
    wrapper.unmount()
  })

  it('送出的 date 是**台北**的今天，不是裝置本地的今天', async () => {
    // 後端 RideCancellationCreateIn 以 today_taipei() 驗 date window。
    // 裝置在 UTC+9 時，台北 23:10 的 todayISO() 是「明天」——落在 +7 天 window
    // 內照收，但明天的 trip 還沒生成 → 後端回 no_stop → 前端顯示**成功**文案，
    // 家長以為報成了，隔天早上車照常來接。裝置在美洲則送出「昨天」→ 422 →
    // catch 成「回報失敗」，重試永遠不會好。
    vi.useFakeTimers()
    // 2026-08-26 15:10 UTC ＝ 台北 2026-08-26 23:10（同日）＝ 東京 8/27 00:10
    vi.setSystemTime(new Date('2026-08-26T15:10:00Z'))
    createRideCancellationMock.mockResolvedValue({
      data: { results: [{ direction: 'morning', success: true, message: 'ok' }] },
    })
    try {
      const wrapper = await mountToday()
      const vm = wrapper.vm as unknown as Vm
      vm.openCancelSheet(1)
      await vm.onRideCancelSubmit(['morning'])
      await flushPromises()

      expect(createRideCancellationMock.mock.calls[0][0]).toMatchObject({
        date: '2026-08-26',
      })
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('部分成功：兩筆結果原樣分筆交給 sheet，不收斂成單一成敗', async () => {
    createRideCancellationMock.mockResolvedValue({
      data: {
        results: [
          { direction: 'morning', success: false, message: '此站已出發，無法取消' },
          { direction: 'afternoon', success: true, message: '已申報今天不搭，司機端已同步' },
        ],
      },
    })
    const wrapper = await mountToday()
    const vm = wrapper.vm as unknown as Vm
    vm.openCancelSheet(1)
    await vm.onRideCancelSubmit(['morning', 'afternoon'])
    await flushPromises()

    expect(vm.cancelResults).toEqual([
      { direction: 'morning', ok: false, message: '此站已出發，無法取消' },
      { direction: 'afternoon', ok: true, message: '已申報今天不搭，司機端已同步' },
    ])
    wrapper.unmount()
  })

  it('送出後重載列表，入口狀態跟著更新', async () => {
    createRideCancellationMock.mockResolvedValue({
      data: { results: [{ direction: 'morning', success: true, message: 'ok' }] },
    })
    const wrapper = await mountToday()
    const vm = wrapper.vm as unknown as Vm
    const callsBefore = getRideCancellationsMock.mock.calls.length

    rideChildren = [{
      ...CHILD_A,
      cancellations: [{ id: 5, direction: 'morning', revocable: true }],
    }]
    vm.openCancelSheet(1)
    await vm.onRideCancelSubmit(['morning'])
    await flushPromises()

    expect(getRideCancellationsMock.mock.calls.length).toBeGreaterThan(callsBefore)
    expect(vm.busRideChildren[0].cancellations).toHaveLength(1)
    wrapper.unmount()
  })

  it('送出失敗時逐方向給錯誤結果，不外流後端訊息', async () => {
    createRideCancellationMock.mockRejectedValue({ response: { data: { detail: '內部細節' } } })
    const wrapper = await mountToday()
    const vm = wrapper.vm as unknown as Vm
    vm.openCancelSheet(1)
    await vm.onRideCancelSubmit(['morning', 'afternoon'])
    await flushPromises()

    expect(vm.cancelResults).toEqual([
      { direction: 'morning', ok: false, message: '回報失敗，請稍後再試' },
      { direction: 'afternoon', ok: false, message: '回報失敗，請稍後再試' },
    ])
    expect(JSON.stringify(vm.cancelResults)).not.toContain('內部細節')
    wrapper.unmount()
  })

  it('撤銷成功後重載並回到選項畫面（撤銷後可再申請）', async () => {
    rideChildren = [{
      ...CHILD_A,
      cancellations: [{ id: 5, direction: 'morning', revocable: true }],
    }]
    revokeRideCancellationMock.mockResolvedValue({ data: { success: true } })
    const wrapper = await mountToday()
    const vm = wrapper.vm as unknown as Vm
    vm.openCancelSheet(1)
    const callsBefore = getRideCancellationsMock.mock.calls.length

    rideChildren = [{ ...CHILD_A, cancellations: [] }]
    await vm.onRideCancelRevoke(5)
    await flushPromises()

    expect(revokeRideCancellationMock).toHaveBeenCalledWith(5)
    expect(getRideCancellationsMock.mock.calls.length).toBeGreaterThan(callsBefore)
    expect(vm.cancelResults).toBeNull()
    wrapper.unmount()
  })

  it('撤銷競態失敗（該站已出發）必須呈現，不得靜默', async () => {
    // 拿到列表之後車才開走 → 後端 422。靜默的話家長會以為撤銷成功、照常在家等車。
    rideChildren = [{
      ...CHILD_A,
      cancellations: [{ id: 5, direction: 'morning', revocable: true }],
    }]
    revokeRideCancellationMock.mockRejectedValue(new Error('422'))
    const wrapper = await mountToday()
    const vm = wrapper.vm as unknown as Vm
    vm.openCancelSheet(1)
    await vm.onRideCancelRevoke(5)
    await flushPromises()

    expect(vm.cancelResults).toEqual([
      { direction: 'morning', ok: false, message: '撤銷失敗，該站可能已經出發' },
    ])
    wrapper.unmount()
  })

  it('關閉 sheet 會清掉上一輪結果，再開不會殘留', async () => {
    createRideCancellationMock.mockResolvedValue({
      data: { results: [{ direction: 'morning', success: true, message: 'ok' }] },
    })
    const wrapper = await mountToday()
    const vm = wrapper.vm as unknown as Vm
    vm.openCancelSheet(1)
    await vm.onRideCancelSubmit(['morning'])
    await flushPromises()
    expect(vm.cancelResults).not.toBeNull()

    vm.closeCancelSheet()
    expect(vm.cancelSheetChild).toBeNull()
    vm.openCancelSheet(1)
    expect(vm.cancelResults).toBeNull()
    wrapper.unmount()
  })
})
