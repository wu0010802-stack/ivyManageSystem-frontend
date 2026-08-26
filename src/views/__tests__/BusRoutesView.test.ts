/**
 * 班次設定頁的組裝守衛。
 *
 * 重點不在重測子元件（各自有 co-located 測試），而在**頁面層的判斷**：
 * ①載入失敗優先於空狀態（否則會誘導建出刪不掉的班次）
 * ②未儲存／缺地址／超載／帶入衝突四個危險狀態必須看得見
 * ③新增班次含 copy-from、自動排序預覽開啟與套用
 * ④名單表格符合 2026-08-26 決策：無「定位」按鈕、無座標數字
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

const mocks = vi.hoisted(() => {
  const { ref, computed } = require('vue') as typeof import('vue')
  const routes = ref<Array<Record<string, unknown>>>([])
  const stops = ref<Array<Record<string, unknown>>>([])
  return {
    api: {
      routes,
      stops,
      activeRoute: computed(() => routes.value[0] ?? null),
      activeRouteId: ref<number | null>(3),
      students: ref<Array<{ id: number; name: string }>>([]),
      candidates: ref<Array<{ id: number; name: string }>>([{ id: 103, name: '小美' }]),
      savedStops: ref<Array<Record<string, unknown>>>([]),
      capacity: computed(() => (routes.value[0]?.capacity as number) ?? 0),
      weekdayLoads: computed(() => [0, 0, 0, 0, 0]),
      maxWeekdayLoad: computed(() => 0),
      overloadedWeekdays: ref<number[]>([]),
      missingCoordinateCount: computed(
        () => stops.value.filter((s) => s.lat == null || s.lng == null).length,
      ),
      staleAddressCount: computed(() => stops.value.filter((s) => s.address_stale === true).length),
      assignedElsewhere: computed(() => new Map()),
      copyConflicts: ref<Array<Record<string, unknown>>>([]),
      loading: ref(false),
      saving: ref(false),
      creating: ref(false),
      updatingRoute: ref(false),
      reordering: ref(false),
      optimizing: ref(false),
      copying: ref(false),
      dirty: ref(false),
      loadFailed: ref(false),
      studentsFailed: ref(false),
      init: vi.fn(),
      loadRoutes: vi.fn(),
      createRoute: vi.fn().mockResolvedValue(11),
      selectRoute: vi.fn().mockResolvedValue(true),
      updateRoute: vi.fn().mockResolvedValue(true),
      reorderRoutes: vi.fn().mockResolvedValue(true),
      confirmDiscard: vi.fn().mockResolvedValue(true),
      addStop: vi.fn(),
      removeStop: vi.fn(),
      moveStop: vi.fn(),
      togglePinned: vi.fn(),
      setRideDays: vi.fn(),
      setPickupAddress: vi.fn(),
      setCoordinates: vi.fn(),
      copyFromRoute: vi.fn().mockResolvedValue(true),
      optimizePreview: vi.fn().mockResolvedValue(null),
      applyOptimize: vi.fn(),
      recomputeEtas: vi.fn().mockResolvedValue(true),
      save: vi.fn(),
      freeRideDaysFor: vi.fn().mockReturnValue(0b11111),
    },
  }
})

vi.mock('@/composables/useBusRouteEditor', async () => {
  const actual = await vi.importActual<typeof import('@/composables/useBusRouteEditor')>(
    '@/composables/useBusRouteEditor',
  )
  return { ...actual, useBusRouteEditor: () => mocks.api }
})
vi.mock('@/api/employees', () => ({ getEmployees: vi.fn().mockResolvedValue({ data: [] }) }))
vi.mock('@/api/bus', () => ({
  listStudentPickupAddresses: vi.fn().mockResolvedValue({ data: { addresses: [] } }),
  createStudentPickupAddress: vi.fn(),
  deleteStudentPickupAddress: vi.fn(),
}))
// onBeforeRouteLeave 需要 router 上下文；本檔只驗呈現，直接 no-op
vi.mock('vue-router', () => ({ onBeforeRouteLeave: vi.fn() }))

import BusRoutesView from '@/views/BusRoutesView.vue'

const s = mocks.api

function route(overrides: Record<string, unknown> = {}) {
  return {
    id: 3,
    name: '早 A',
    is_active: true,
    direction: 'morning',
    depart_time: '07:30:00',
    end_time_planned: '08:10:00',
    sort_order: 0,
    capacity: 20,
    operators: [],
    stops: [],
    ...overrides,
  }
}

function stop(overrides: Record<string, unknown> = {}) {
  return {
    student_id: 101,
    student_name: '小明',
    classroom_name: '小班',
    seq: 1,
    lat: 22.61,
    lng: 120.31,
    address_snapshot: '高雄市三民區某路 1 號',
    address_stale: false,
    ride_days: 0b11111,
    pinned: false,
    pickup_address_id: null,
    eta_planned: '07:35:00',
    contacts: [],
    ...overrides,
  }
}

async function mountView() {
  const w = mount(BusRoutesView, { global: { plugins: [ElementPlus] } })
  await flushPromises()
  return w
}

beforeEach(() => {
  vi.clearAllMocks()
  s.routes.value = [route()]
  s.stops.value = [stop()]
  s.activeRouteId.value = 3
  s.copyConflicts.value = []
  s.overloadedWeekdays.value = []
  s.loading.value = false
  s.loadFailed.value = false
  s.studentsFailed.value = false
  s.dirty.value = false
  s.optimizePreview.mockResolvedValue(null)
  s.createRoute.mockResolvedValue(11)
  s.copyFromRoute.mockResolvedValue(true)
})

describe('BusRoutesView — 誠實降級', () => {
  it('載入失敗顯示錯誤卡，且**不得**出現空狀態的「建立第一個班次」', async () => {
    s.loadFailed.value = true
    s.routes.value = []
    const w = await mountView()
    expect(w.find('[data-testid="bus-routes-load-error"]').exists()).toBe(true)
    expect(w.find('[data-testid="bus-routes-empty"]').exists()).toBe(false)
  })

  it('載入失敗時新增班次按鈕 disabled（避免建出重複且刪不掉的班次）', async () => {
    s.loadFailed.value = true
    s.routes.value = []
    const w = await mountView()
    expect(w.find('[data-testid="bus-routes-create"]').attributes('disabled')).toBeDefined()
  })

  it('真的沒有班次才顯示空狀態', async () => {
    s.routes.value = []
    const w = await mountView()
    expect(w.find('[data-testid="bus-routes-empty"]').exists()).toBe(true)
  })

  it('學生名單載入失敗要明說，不得讓空選單看起來像「沒有學生可以加」', async () => {
    s.studentsFailed.value = true
    const w = await mountView()
    expect(w.find('[data-testid="bus-students-error"]').exists()).toBe(true)
  })
})

describe('BusRoutesView — 危險狀態必須看得見', () => {
  it('未儲存標記', async () => {
    s.dirty.value = true
    const w = await mountView()
    expect(w.find('[data-testid="bus-dirty"]').exists()).toBe(true)
  })

  it('缺可定位地址的站數（這個班次無法發車）', async () => {
    s.stops.value = [stop({ lat: null, lng: null, address_snapshot: null })]
    const w = await mountView()
    expect(w.find('[data-testid="bus-missing-coords"]').exists()).toBe(true)
  })

  it('地址已變更的站數彙總提示', async () => {
    s.stops.value = [stop({ address_stale: true })]
    const w = await mountView()
    expect(w.find('[data-testid="bus-stale-addresses"]').exists()).toBe(true)
  })

  it('capacity 逐星期超載提示指出是哪幾個星期', async () => {
    s.overloadedWeekdays.value = [0, 3]
    const w = await mountView()
    const alert = w.find('[data-testid="bus-capacity-overload"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('週一、四')
  })

  it('帶入名單的衝突學生逐筆列出（預覽呈現、儲存才擋）', async () => {
    s.copyConflicts.value = [
      { student_id: 104, student_name: '小強', conflict_route_name: '早 B' },
    ]
    const w = await mountView()
    const alert = w.find('[data-testid="bus-copy-conflicts"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('小強')
    expect(alert.text()).toContain('早 B')
  })

  it('停用的班次要標示不會出現在開班選單', async () => {
    s.routes.value = [route({ is_active: false })]
    const w = await mountView()
    expect(w.find('[data-testid="bus-route-inactive"]').exists()).toBe(true)
  })
})

describe('BusRoutesView — 名單表格符合 2026-08-26 地址導向決策', () => {
  it('操作欄是「設定接送地址」，沒有舊版「定位」按鈕', async () => {
    const w = await mountView()
    expect(w.find('[data-test="pick-address-101"]').text()).toBe('設定接送地址')
    expect(w.findAll('button').map((b) => b.text())).not.toContain('定位')
  })

  it('地址欄顯示地址文字，畫面上不出現任何經緯度數字', async () => {
    const w = await mountView()
    expect(w.find('[data-test="address-cell"]').text()).toContain('高雄市三民區某路 1 號')
    expect(w.html()).not.toContain('22.61')
    expect(w.html()).not.toContain('120.31')
  })
})

describe('BusRoutesView — 新增班次（含 copy-from）', () => {
  it('建立成功後才帶名單（copy-from 需要一個已存在的目標班次）', async () => {
    const w = await mountView()
    await w.find('[data-testid="bus-routes-create"]').trigger('click')
    await flushPromises()
    await w.find('[data-testid="create-name"]').setValue('早 C')
    w.findComponent('[data-testid="create-copy-source"]').vm.$emit('update:modelValue', 5)
    await flushPromises()
    await w.find('[data-testid="create-submit"]').trigger('click')
    await flushPromises()
    expect(s.createRoute).toHaveBeenCalledWith(expect.objectContaining({
      name: '早 C', direction: 'morning',
    }))
    expect(s.copyFromRoute).toHaveBeenCalledWith(5, true)
    expect(s.copyFromRoute.mock.invocationCallOrder[0])
      .toBeGreaterThan(s.createRoute.mock.invocationCallOrder[0])
  })

  it('建立失敗（回 null）就不帶名單，也不關 Dialog', async () => {
    s.createRoute.mockResolvedValue(null)
    const w = await mountView()
    await w.find('[data-testid="bus-routes-create"]').trigger('click')
    await flushPromises()
    await w.find('[data-testid="create-submit"]').trigger('click')
    await flushPromises()
    expect(s.copyFromRoute).not.toHaveBeenCalled()
    expect(w.find('[data-testid="create-submit"]').exists()).toBe(true)
  })

  it('沒選來源班次就不呼叫 copy-from', async () => {
    const w = await mountView()
    await w.find('[data-testid="bus-routes-create"]').trigger('click')
    await flushPromises()
    await w.find('[data-testid="create-submit"]').trigger('click')
    await flushPromises()
    expect(s.createRoute).toHaveBeenCalled()
    expect(s.copyFromRoute).not.toHaveBeenCalled()
  })
})

describe('BusRoutesView — 自動排序預覽', () => {
  const preview = {
    applied: false,
    end_time_planned: '08:05:00',
    moved_unpinned_student_ids: [101],
    stops: [{ student_id: 101, seq: 1, eta_planned: '07:33:00' }],
  }

  it('預覽被擋下（回 null）時不開 Dialog——composable 已說明原因，不再給一個空對話框', async () => {
    const w = await mountView()
    await w.find('[data-testid="bus-optimize"]').trigger('click')
    await flushPromises()
    expect(w.findComponent({ name: 'BusOptimizePreviewDialog' }).props('visible')).toBe(false)
  })

  it('預覽成功後開啟 Dialog，並把後端原樣補成可讀 diff（姓名／新舊順位／被移動）', async () => {
    s.optimizePreview.mockResolvedValue(preview)
    const w = await mountView()
    await w.find('[data-testid="bus-optimize"]').trigger('click')
    await flushPromises()
    const dialog = w.findComponent({ name: 'BusOptimizePreviewDialog' })
    expect(dialog.props('visible')).toBe(true)
    const p = dialog.props('preview') as { order: Array<Record<string, unknown>>; moved_unpinned_count: number }
    expect(p.order[0]).toMatchObject({
      student_id: 101, student_name: '小明', old_seq: 1, new_seq: 1, moved: true,
    })
    expect(p.moved_unpinned_count).toBe(1)
  })

  it('套用只寫進編輯緩衝，不自動儲存', async () => {
    s.optimizePreview.mockResolvedValue(preview)
    const w = await mountView()
    await w.find('[data-testid="bus-optimize"]').trigger('click')
    await flushPromises()
    w.findComponent({ name: 'BusOptimizePreviewDialog' }).vm.$emit('apply')
    await flushPromises()
    expect(s.applyOptimize).toHaveBeenCalledWith(preview)
    expect(s.save).not.toHaveBeenCalled()
  })
})

describe('BusRoutesView — 工具列接線', () => {
  it('加入學生後清空選單（避免同一位被連按兩次）', async () => {
    const w = await mountView()
    w.findComponent('[data-testid="bus-student-select"]').vm.$emit('update:modelValue', 103)
    await flushPromises()
    await w.find('[data-testid="bus-add-stop"]').trigger('click')
    await flushPromises()
    expect(s.addStop).toHaveBeenCalledWith(103)
    expect(w.find('[data-testid="bus-add-stop"]').attributes('disabled')).toBeDefined()
  })

  it('儲存、重算 ETA 各自接對 composable', async () => {
    const w = await mountView()
    await w.find('[data-testid="bus-save"]').trigger('click')
    expect(s.save).toHaveBeenCalled()
    await w.find('[data-testid="bus-recompute-etas"]').trigger('click')
    expect(s.recomputeEtas).toHaveBeenCalled()
  })

  it('側欄拖拉排序把該方向的完整 ids 交給 composable', async () => {
    const w = await mountView()
    w.findComponent({ name: 'BusRouteSidebar' }).vm.$emit('reorder', {
      direction: 'morning', ids: [5, 3],
    })
    await flushPromises()
    expect(s.reorderRoutes).toHaveBeenCalledWith([5, 3])
  })

  it('側欄選取一律經 composable（先跑未儲存確認），頁面不自行改 activeRouteId', async () => {
    const w = await mountView()
    w.findComponent({ name: 'BusRouteSidebar' }).vm.$emit('select', 5)
    await flushPromises()
    expect(s.selectRoute).toHaveBeenCalledWith(5)
  })
})
