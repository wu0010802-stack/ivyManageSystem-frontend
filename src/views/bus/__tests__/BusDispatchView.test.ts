/**
 * 今日調度頁的組裝守衛。
 *
 * 這一頁最容易出的錯不是渲染，而是**把兩種唯讀說成同一件事**、以及**把破壞性
 * 操作的範圍講錯**：
 * - 「班次已結束」是誰都不能改，「權限不足」是這個人不能改、要去找誰授權。
 * - 重設在 planned 是丟棄全部當日修改，在 in_progress 是保留已離站的站——
 *   二次確認若說不清楚，使用者按下去之前不會知道自己要失去什麼。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => {
  const { ref: r, computed: c } = require('vue') as typeof import('vue')
  const plans = r<Array<Record<string, unknown>>>([])
  const selectedTripId = r<number | null>(null)
  const selectedPlan = c(
    () => plans.value.find((p) => (p.trip as { id: number }).id === selectedTripId.value) ?? null,
  )
  return {
    confirm: vi.fn(() => Promise.resolve()),
    api: {
      date: r('2026-08-26'),
      plans,
      selectedPlan,
      selectedTripId,
      loading: r(false),
      saving: r(false),
      loadFailed: r(false),
      holidayNotice: r<Record<string, unknown> | null>(null),
      etaStale: r(false),
      overCapacity: r(false),
      editable: r(true),
      inProgress: r(false),
      lockedByPermission: r(false),
      optimizePreviewData: r<Record<string, unknown> | null>(null),
      optimizing: r(false),
      optimizeError: r<string | null>(null),
      insertCandidates: r<Array<{ id: number; name: string }>>([]),
      studentsLoading: r(false),
      students: r([]),
      studentsFailed: r(false),
      load: vi.fn(),
      setDate: vi.fn(),
      selectTrip: vi.fn(),
      canEdit: vi.fn(() => true),
      loadStudents: vi.fn(),
      insertStop: vi.fn(() => Promise.resolve(true)),
      markExcusedAdmin: vi.fn(),
      unmarkExcused: vi.fn(),
      changeAddress: vi.fn(() => Promise.resolve(true)),
      removeStop: vi.fn(),
      moveStop: vi.fn(),
      optimizePreview: vi.fn(),
      applyOptimize: vi.fn(() => Promise.resolve(true)),
      cancelOptimize: vi.fn(),
      resetPlan: vi.fn(() => Promise.resolve(true)),
    },
  }
})

vi.mock('@/composables/useBusDailyDispatch', () => ({
  useBusDailyDispatch: () => mocks.api,
  MAX_DAYS_AHEAD: 7,
}))
vi.mock('element-plus', () => ({
  ElMessageBox: { confirm: mocks.confirm },
  ElMessage: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
}))
// 子元件各有自己的測試；本檔只驗組裝，全部以最小 stub 承接
vi.mock('@/components/bus/BusPickupAddressSelect.vue', () => ({
  default: { name: 'BusPickupAddressSelect', props: ['studentId', 'modelValue', 'homeAddress'], template: '<div />' },
}))
vi.mock('@/components/bus/BusStopMapTuner.vue', () => ({
  default: { name: 'BusStopMapTuner', props: ['visible', 'lat', 'lng', 'label', 'schoolCoords'], template: '<div />' },
}))

import BusDispatchView from '@/views/bus/BusDispatchView.vue'

const s = mocks.api

const GLOBAL_STUBS = {
  'el-skeleton': { template: '<div class="el-skeleton" />' },
  'el-empty': { template: '<div class="el-empty">{{ description }}</div>', props: ['description'] },
  'el-alert': {
    template: '<div class="el-alert" :title="title" :description="description"><slot name="title" /></div>',
    props: ['title', 'description'],
  },
  'el-button': { template: '<button v-bind="$attrs"><slot /></button>' },
  'el-dialog': {
    template: '<div v-if="modelValue" class="el-dialog"><slot /><slot name="footer" /></div>',
    props: ['modelValue'],
  },
  'el-tag': { template: '<span><slot /></span>' },
  'el-date-picker': { template: '<input />' },
}

function stop(overrides: Record<string, unknown> = {}) {
  return {
    stop_id: 11, student_id: 101, student_name: '小明', seq: 1,
    lat: 22.61, lng: 120.31, status: 'pending', excuse_reason: null,
    source: 'default', pinned: false, eta_planned: null, eta_live: null,
    address: '高雄市…', contacts: [], departed_at: null,
    ...overrides,
  }
}

function plan(overrides: Record<string, unknown> = {}, tripOverrides: Record<string, unknown> = {}) {
  return {
    trip: {
      id: 7, route_id: 3, direction: 'morning', trip_date: '2026-08-26', status: 'planned',
      auto_closed: false, created_at: '2026-08-26T06:00:00', depart_time_planned: '07:00:00',
      started_at: null, operator_employee_id: null,
      last_ping_at: null, last_lat: null, last_lng: null,
      ...tripOverrides,
    },
    stops: [stop()],
    calendar_warnings: [],
    capacity: 20,
    departed_pending: 1,
    eta_may_be_stale: false,
    route_name: 'A 線',
    direction: 'morning',
    depart_time: '07:00:00',
    ...overrides,
  }
}

const mountView = () => mount(BusDispatchView, { global: { stubs: GLOBAL_STUBS } })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.confirm.mockResolvedValue(undefined)
  s.plans.value = [plan()]
  s.selectedTripId.value = 7
  s.loading.value = false
  s.saving.value = false
  s.loadFailed.value = false
  s.holidayNotice.value = null
  s.etaStale.value = false
  s.overCapacity.value = false
  s.editable.value = true
  s.inProgress.value = false
  s.lockedByPermission.value = false
  s.optimizePreviewData.value = null
  s.optimizeError.value = null
  s.insertCandidates.value = []
})

describe('載入與三態', () => {
  it('進頁呼叫 load（懶生成端點，只在顯式動作時打）', async () => {
    mountView()
    await flushPromises()
    expect(s.load).toHaveBeenCalledTimes(1)
  })

  it('載入失敗顯示錯誤卡，且**不得**顯示「尚未建立任何班次」的空狀態', async () => {
    s.loadFailed.value = true
    s.plans.value = []
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-testid="bus-dispatch-error"]').exists()).toBe(true)
    expect(w.find('[data-testid="bus-dispatch-empty"]').exists()).toBe(false)
    expect(w.find('[data-testid="bus-dispatch-cards"]').exists()).toBe(false)
  })

  it('載入成功但真的沒有班次時才顯示空狀態', async () => {
    s.plans.value = []
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-testid="bus-dispatch-empty"]').exists()).toBe(true)
  })
})

describe('班次卡片', () => {
  it('四種狀態都渲染成卡片並帶出班次名稱', async () => {
    s.plans.value = [
      plan({ route_name: 'A 線' }, { id: 7, status: 'planned' }),
      plan({ route_name: 'B 線' }, { id: 8, route_id: 4, status: 'in_progress' }),
      plan({ route_name: 'C 線' }, { id: 9, route_id: 5, status: 'completed' }),
      plan({ route_name: 'D 線' }, { id: 10, route_id: 6, status: 'expired' }),
    ]
    const w = mountView()
    await flushPromises()

    const cards = w.findAllComponents({ name: 'BusDispatchRouteCard' })
    expect(cards).toHaveLength(4)
    expect(cards.map((c) => (c.props('plan') as { status: string }).status))
      .toEqual(['planned', 'in_progress', 'completed', 'expired'])
    expect(cards.map((c) => (c.props('plan') as { route_name: string }).route_name))
      .toEqual(['A 線', 'B 線', 'C 線', 'D 線'])
  })

  it('載客計數由站點狀態算出：departed + pending，excused／skipped 不計', async () => {
    s.plans.value = [plan({
      stops: [
        stop({ stop_id: 10, student_id: 100, status: 'departed' }),
        stop({ stop_id: 11, student_id: 101, status: 'pending' }),
        stop({ stop_id: 12, student_id: 102, status: 'pending' }),
        stop({ stop_id: 13, student_id: 103, status: 'excused', excuse_reason: 'leave' }),
        stop({ stop_id: 14, student_id: 104, status: 'skipped' }),
      ],
    })]
    const w = mountView()
    await flushPromises()
    const card = w.findComponent({ name: 'BusDispatchRouteCard' }).props('plan') as Record<string, number>
    expect(card.departed_count).toBe(1)
    expect(card.pending_count).toBe(2)
  })

  it('點卡片以該班次的 trip_id 切換（卡片 emit 的是 route_id）', async () => {
    s.plans.value = [plan({}, { id: 7, route_id: 3 }), plan({}, { id: 8, route_id: 4 })]
    const w = mountView()
    await flushPromises()
    w.findAllComponents({ name: 'BusDispatchRouteCard' })[1].vm.$emit('select', 4)
    await flushPromises()
    expect(s.selectTrip).toHaveBeenCalledWith(8)
  })
})

describe('唯讀鎖（兩種原因，文案不可共用）', () => {
  it('權限不足：說明要找誰授權，且不說成「班次已結束」', async () => {
    s.editable.value = false
    s.lockedByPermission.value = true
    const w = mountView()
    await flushPromises()

    const locked = w.find('[data-testid="bus-dispatch-locked"]')
    expect(locked.exists()).toBe(true)
    expect(locked.attributes('description')).toContain('聯絡系統管理員')
    expect(w.find('[data-testid="bus-dispatch-closed"]').exists()).toBe(false)
  })

  it('in_progress 缺 BUS_IN_PROGRESS_WRITE 時明講是「發車後調整」權限', async () => {
    s.editable.value = false
    s.lockedByPermission.value = true
    s.inProgress.value = true
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-testid="bus-dispatch-locked"]').attributes('title')).toContain('發車後調整')
  })

  it('班次已結束：另一句文案，不提權限', async () => {
    s.editable.value = false
    s.lockedByPermission.value = false
    const w = mountView()
    await flushPromises()

    const closed = w.find('[data-testid="bus-dispatch-closed"]')
    expect(closed.exists()).toBe(true)
    expect(closed.attributes('title')).toContain('已結束')
    expect(w.find('[data-testid="bus-dispatch-locked"]').exists()).toBe(false)
  })

  it('唯讀時三個工具列動作皆 disabled，名單表也轉唯讀', async () => {
    s.editable.value = false
    const w = mountView()
    await flushPromises()

    expect(w.find('[data-testid="bus-dispatch-optimize"]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-testid="bus-dispatch-insert"]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-testid="bus-dispatch-reset"]').attributes('disabled')).toBeDefined()
    expect(w.findComponent({ name: 'BusDispatchStopsTable' }).props('readonly')).toBe(true)
  })

  it('in_progress 不給「插入學生」以外的差異：插入仍不開放（後端只在 planned 允許名單增減）', async () => {
    s.inProgress.value = true
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-testid="bus-dispatch-insert"]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-testid="bus-dispatch-optimize"]').attributes('disabled')).toBeUndefined()
  })
})

describe('超載與 ETA 提示', () => {
  it('超過座位上限時顯著警示，並說明銷假還原不會自動拒載', async () => {
    s.overCapacity.value = true
    const w = mountView()
    await flushPromises()
    const alert = w.find('[data-testid="bus-dispatch-overcapacity"]')
    expect(alert.exists()).toBe(true)
    expect(alert.attributes('description')).toContain('不會自動拒載')
  })

  it('etaStale 透傳給名單表', async () => {
    s.etaStale.value = true
    const w = mountView()
    await flushPromises()
    expect(w.findComponent({ name: 'BusDispatchStopsTable' }).props('etaStale')).toBe(true)
  })
})

describe('重設為預設名單（二次確認要說出破壞範圍）', () => {
  it('planned：文案明說會丟棄全部當日修改', async () => {
    const w = mountView()
    await flushPromises()
    await w.find('[data-testid="bus-dispatch-reset"]').trigger('click')
    await flushPromises()

    expect(mocks.confirm.mock.calls[0][0]).toContain('丟棄今天對這條班次的全部修改')
    expect(s.resetPlan).toHaveBeenCalledTimes(1)
  })

  it('in_progress：文案明說已離站保留、後台排除與臨時插入丟棄', async () => {
    s.plans.value = [plan({}, { status: 'in_progress' })]
    const w = mountView()
    await flushPromises()
    await w.find('[data-testid="bus-dispatch-reset"]').trigger('click')
    await flushPromises()

    const copy = mocks.confirm.mock.calls[0][0] as string
    expect(copy).toContain('已離站的站會保留')
    expect(copy).toContain('後台排除與臨時插入')
  })

  it('取消確認時不送出', async () => {
    mocks.confirm.mockRejectedValue(new Error('cancel'))
    const w = mountView()
    await flushPromises()
    await w.find('[data-testid="bus-dispatch-reset"]').trigger('click')
    await flushPromises()
    expect(s.resetPlan).not.toHaveBeenCalled()
  })
})

describe('插入學生', () => {
  it('開啟時才載入全園名冊（進頁不撈）', async () => {
    const w = mountView()
    await flushPromises()
    expect(s.loadStudents).not.toHaveBeenCalled()

    await w.find('[data-testid="bus-dispatch-insert"]').trigger('click')
    await flushPromises()
    expect(s.loadStudents).toHaveBeenCalledTimes(1)
    expect(w.findComponent({ name: 'BusDispatchInsertStudentDialog' }).props('visible')).toBe(true)
  })

  it('成功後關閉 Dialog', async () => {
    const w = mountView()
    await flushPromises()
    await w.find('[data-testid="bus-dispatch-insert"]').trigger('click')
    await flushPromises()

    w.findComponent({ name: 'BusDispatchInsertStudentDialog' }).vm.$emit('submit', { student_id: 202 })
    await flushPromises()
    expect(s.insertStop).toHaveBeenCalledWith({ student_id: 202 })
    expect(w.findComponent({ name: 'BusDispatchInsertStudentDialog' }).props('visible')).toBe(false)
  })

  it('失敗（422）時 Dialog 保持開啟並帶回錯誤訊息', async () => {
    s.insertStop.mockResolvedValue(false)
    const w = mountView()
    await flushPromises()
    await w.find('[data-testid="bus-dispatch-insert"]').trigger('click')
    await flushPromises()

    const dialog = w.findComponent({ name: 'BusDispatchInsertStudentDialog' })
    dialog.vm.$emit('submit', { student_id: 202 })
    await flushPromises()
    expect(dialog.props('visible')).toBe(true)
    expect(dialog.props('errorMessage')).toBeTruthy()
  })
})

describe('自動排序預覽', () => {
  it('開啟時呼叫預覽，並把後端形狀轉成 Dialog 契約（含 moved 標示與原順序）', async () => {
    s.optimizePreviewData.value = {
      applied: false,
      stops: [
        { student_id: 101, seq: 1, eta_planned: '07:15' },
        { student_id: 102, seq: 2, eta_planned: '07:25' },
      ],
      end_time_estimated: '07:50',
      moved_unpinned_student_ids: [102],
    }
    s.plans.value = [plan({
      stops: [
        stop({ student_id: 101, student_name: '小明', seq: 2, pinned: true }),
        stop({ stop_id: 12, student_id: 102, student_name: '小華', seq: 1 }),
      ],
    })]
    const w = mountView()
    await flushPromises()
    await w.find('[data-testid="bus-dispatch-optimize"]').trigger('click')
    await flushPromises()

    expect(s.optimizePreview).toHaveBeenCalledTimes(1)
    const preview = w.findComponent({ name: 'BusOptimizePreviewDialog' }).props('preview') as {
      order: Array<Record<string, unknown>>
      end_time_planned: string | null
      moved_unpinned_count: number
    }
    expect(preview.order).toEqual([
      { student_id: 101, student_name: '小明', old_seq: 2, new_seq: 1, pinned: true, eta: '07:15', moved: false },
      { student_id: 102, student_name: '小華', old_seq: 1, new_seq: 2, pinned: false, eta: '07:25', moved: true },
    ])
    expect(preview.end_time_planned).toBe('07:50')
    expect(preview.moved_unpinned_count).toBe(1)
  })

  it('502 時把錯誤交給 Dialog（重試由 Dialog 觸發），不假裝排序成功', async () => {
    s.optimizeError.value = '路徑最佳化服務暫時無法使用，請稍後重試'
    const w = mountView()
    await flushPromises()
    await w.find('[data-testid="bus-dispatch-optimize"]').trigger('click')
    await flushPromises()

    const dialog = w.findComponent({ name: 'BusOptimizePreviewDialog' })
    expect(dialog.props('error')).toContain('暫時無法使用')
    expect(dialog.props('preview')).toBeNull()

    dialog.vm.$emit('retry')
    await flushPromises()
    expect(s.optimizePreview).toHaveBeenCalledTimes(2)
  })
})

describe('接送地址（含地圖微調，兩者一起送）', () => {
  async function openAddressDialog() {
    const w = mountView()
    await flushPromises()
    w.findComponent({ name: 'BusDispatchStopsTable' }).vm.$emit('change-address', 101)
    await flushPromises()
    return w
  }

  it('名單表的 change-address 開啟地址 Dialog', async () => {
    const w = await openAddressDialog()
    expect(w.find('[data-testid="bus-dispatch-address-dialog"]').exists()).toBe(true)
  })

  it('尚未解析出地址前不可套用；解析出有座標的地址後才可', async () => {
    const w = await openAddressDialog()
    expect(w.find('[data-testid="bus-dispatch-address-submit"]').attributes('disabled')).toBeDefined()

    w.findComponent({ name: 'BusPickupAddressSelect' }).vm.$emit('resolved', {
      id: 9, lat: 22.7, lng: 120.4, address: '高雄市…',
    })
    await flushPromises()
    expect(w.find('[data-testid="bus-dispatch-address-submit"]').attributes('disabled')).toBeUndefined()
  })

  it('地址無座標時擋住套用並警示（缺座標會讓整條班次無法發車）', async () => {
    const w = await openAddressDialog()
    w.findComponent({ name: 'BusPickupAddressSelect' }).vm.$emit('resolved', {
      id: 9, lat: null, lng: null, address: '高雄市…',
    })
    await flushPromises()
    expect(w.find('[data-testid="bus-dispatch-address-nocoord"]').exists()).toBe(true)
    expect(w.find('[data-testid="bus-dispatch-address-submit"]').attributes('disabled')).toBeDefined()
  })

  it('地圖微調後的座標與 pickup_address_id 一起送，不會把地址清成住家', async () => {
    const w = await openAddressDialog()
    w.findComponent({ name: 'BusPickupAddressSelect' }).vm.$emit('resolved', {
      id: 9, lat: 22.7, lng: 120.4, address: '高雄市…',
    })
    await flushPromises()

    await w.find('[data-testid="bus-dispatch-address-map"]').trigger('click')
    await flushPromises()
    w.findComponent({ name: 'BusStopMapTuner' }).vm.$emit('confirm', 22.75, 120.45)
    await flushPromises()

    await w.find('[data-testid="bus-dispatch-address-submit"]').trigger('click')
    await flushPromises()

    expect(s.changeAddress).toHaveBeenCalledWith({
      student_id: 101, pickup_address_id: 9, lat: 22.75, lng: 120.45,
    })
  })

  it('住家（pickup_address_id = null）是正常選項，一樣可套用', async () => {
    const w = await openAddressDialog()
    w.findComponent({ name: 'BusPickupAddressSelect' }).vm.$emit('resolved', {
      id: null, lat: 22.5, lng: 120.2, address: '學生住址',
    })
    await flushPromises()
    await w.find('[data-testid="bus-dispatch-address-submit"]').trigger('click')
    await flushPromises()

    expect(s.changeAddress).toHaveBeenCalledWith({
      student_id: 101, pickup_address_id: null, lat: 22.5, lng: 120.2,
    })
  })
})

describe('日期列', () => {
  it('換日透過 composable 的 setDate（含今天~+7 守衛），不自行改 date', async () => {
    const w = mountView()
    await flushPromises()
    w.findComponent({ name: 'BusDispatchDateBar' }).vm.$emit('update:modelValue', '2026-08-28')
    await flushPromises()
    expect(s.setDate).toHaveBeenCalledWith('2026-08-28')
  })

  it('假日警示透傳給日期列（顯著提示但不阻擋）', async () => {
    s.holidayNotice.value = { is_holiday: true, label: '本日為假日：中秋節' }
    const w = mountView()
    await flushPromises()
    expect(w.findComponent({ name: 'BusDispatchDateBar' }).props('holidayNotice'))
      .toEqual({ is_holiday: true, label: '本日為假日：中秋節' })
  })
})
