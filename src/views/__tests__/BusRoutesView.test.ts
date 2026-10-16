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
      optimizeErrorMessage: ref<string | null>(null),
      loading: ref(false),
      saving: ref(false),
      creating: ref(false),
      updatingRoute: ref(false),
      reordering: ref(false),
      optimizing: ref(false),
      recomputingEtas: ref(false),
      copying: ref(false),
      dirty: ref(false),
      anyDirty: ref(false),
      registerExtraDirty: vi.fn(),
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
vi.mock('@/api/employees', () => ({ getEmployees: vi.fn() }))
vi.mock('@/api/bus', () => ({
  listStudentPickupAddresses: vi.fn().mockResolvedValue({ data: { addresses: [] } }),
  createStudentPickupAddress: vi.fn(),
  updateStudentPickupAddress: vi.fn(),
  relocateStudentPickupAddress: vi.fn(),
  deleteStudentPickupAddress: vi.fn(),
  geocodeBusStudent: vi.fn(),
  getBusSettings: vi.fn().mockResolvedValue({ data: { school_lat: 22.6, school_lng: 120.3 } }),
}))
vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus')
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
    ElMessageBox: { confirm: vi.fn() },
  }
})
// onBeforeRouteLeave 需要 router 上下文；這裡攔下註冊的守衛以便直接呼叫
vi.mock('vue-router', () => ({ onBeforeRouteLeave: vi.fn() }))

import { onBeforeRouteLeave } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { geocodeBusStudent, relocateStudentPickupAddress } from '@/api/bus'
import { getEmployees } from '@/api/employees'
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
  s.anyDirty.value = false
  s.saving.value = false
  s.optimizing.value = false
  s.recomputingEtas.value = false
  s.copying.value = false
  s.optimizeErrorMessage.value = null
  s.optimizePreview.mockResolvedValue(null)
  s.createRoute.mockResolvedValue(11)
  s.copyFromRoute.mockResolvedValue(true)
  vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
  vi.mocked(getEmployees).mockResolvedValue({ data: [] } as never)
})

describe('BusRoutesView — 未儲存離頁保護', () => {
  async function leaveGuard() {
    await mountView()
    const calls = vi.mocked(onBeforeRouteLeave).mock.calls
    return calls.at(-1)?.[0] as () => Promise<boolean>
  }

  it('沒有未儲存變更時直接放行，不打擾使用者', async () => {
    s.anyDirty.value = false
    const guard = await leaveGuard()
    await expect(guard()).resolves.toBe(true)
    expect(ElMessageBox.confirm).not.toHaveBeenCalled()
  })

  it('有未儲存變更時攔下；使用者選「留在這裡」就不離開', async () => {
    s.anyDirty.value = true
    const guard = await leaveGuard()
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce(new Error('cancel'))
    await expect(guard()).resolves.toBe(false)
  })

  it('使用者確認捨棄才放行', async () => {
    s.anyDirty.value = true
    const guard = await leaveGuard()
    await expect(guard()).resolves.toBe(true)
  })
})

describe('BusRoutesView — 關分頁／重新整理保護', () => {
  it('未儲存時 beforeunload 要攔下', async () => {
    s.anyDirty.value = true
    await mountView()
    const ev = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent
    window.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
  })

  it('沒有未儲存變更時 beforeunload 不攔截', async () => {
    s.anyDirty.value = false
    await mountView()
    const ev = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent
    window.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(false)
  })

  it('unmount 後移除 beforeunload listener，不殘留', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const w = await mountView()
    const added = addSpy.mock.calls.find((c) => c[0] === 'beforeunload')
    expect(added).toBeDefined()
    w.unmount()
    expect(removeSpy).toHaveBeenCalledWith('beforeunload', added?.[1])
    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it('班次設定表單回報 dirty 後，離頁保護要跟著生效（表單編輯也不能靜默消失）', async () => {
    s.anyDirty.value = false
    const w = await mountView()
    // 表單 dirty 走 registerExtraDirty 進 composable，這裡驗證頁面確實有註冊與接線
    expect(s.registerExtraDirty).toHaveBeenCalled()
    w.findComponent({ name: 'BusRouteForm' }).vm.$emit('update:dirty', true)
    await flushPromises()
    const isDirty = (s.registerExtraDirty.mock.calls[0][0] as () => boolean)()
    expect(isDirty).toBe(true)
  })
})

describe('BusRoutesView — 自動排序失敗要給重試入口', () => {
  it('被未儲存變更擋下時不開錯誤對話框（重試也還是會被擋）', async () => {
    s.optimizePreview.mockResolvedValue(null)
    s.optimizeErrorMessage.value = null
    const w = await mountView()
    await w.find('[data-testid="bus-optimize"]').trigger('click')
    await flushPromises()
    expect(w.findComponent({ name: 'BusOptimizePreviewDialog' }).props('visible')).toBe(false)
  })

  it('真的失敗（Azure 502）時開 Dialog 並帶錯誤訊息，讓「重試」可按', async () => {
    s.optimizePreview.mockResolvedValue(null)
    s.optimizeErrorMessage.value = '路徑服務暫時無法使用，請稍後再試'
    const w = await mountView()
    await w.find('[data-testid="bus-optimize"]').trigger('click')
    await flushPromises()
    const dialog = w.findComponent({ name: 'BusOptimizePreviewDialog' })
    expect(dialog.props('visible')).toBe(true)
    expect(dialog.props('error')).toBe('路徑服務暫時無法使用，請稍後再試')
  })
})

describe('BusRoutesView — 新增班次 Dialog 的不可逆警語', () => {
  it('明說建立後無法刪除、方向不可更改', async () => {
    const w = await mountView()
    await w.find('[data-testid="bus-routes-create"]').trigger('click')
    await flushPromises()
    const warning = w.find('[data-testid="create-warning"]')
    expect(warning.exists()).toBe(true)
    expect(warning.text()).toContain('無法刪除')
    expect(warning.text()).toContain('方向也不可更改')
  })
})

describe('BusRoutesView — 隨車老師名單載入失敗', () => {
  it('明說是載入失敗，不得讓空選單看起來像「園裡沒有老師」', async () => {
    vi.mocked(getEmployees).mockRejectedValueOnce(new Error('boom'))
    const w = await mountView()
    expect(w.find('[data-testid="bus-employees-error"]').exists()).toBe(true)
  })
})

describe('BusRoutesView — 住家地址沒有座標時補 geocode', () => {
  function pickAddress(w: ReturnType<typeof mount>, resolved: Record<string, unknown>) {
    w.findComponent({ name: 'BusRouteStopsTable' }).vm.$emit('pick-address', 0)
    return w.vm.$nextTick().then(() => {
      w.findComponent({ name: 'BusPickupAddressSelect' }).vm.$emit('resolved', resolved)
      return flushPromises()
    })
  }

  it('選住家（後端恆不帶座標）會呼叫 geocode 端點補上，再寫回站點', async () => {
    // 站點還沒有座標，補 geocode 才是這條路徑的本意（有座標時見下一條：不得覆寫）。
    s.stops.value = [stop({ lat: null, lng: null })]
    vi.mocked(geocodeBusStudent).mockResolvedValue({ data: { lat: 22.65, lng: 120.35 } } as never)
    const w = await mountView()
    await pickAddress(w, { id: null, lat: null, lng: null, address: '住家地址', reason: 'selected' })
    expect(geocodeBusStudent).toHaveBeenCalledWith(101)
    expect(s.setPickupAddress).toHaveBeenCalledWith(0, {
      id: null, lat: 22.65, lng: 120.35, address: '住家地址',
    })
  })

  it('geocode 查不到座標要明說改用地圖微調，不留一個沒有下一步的死巷', async () => {
    s.stops.value = [stop({ lat: null, lng: null })]
    vi.mocked(geocodeBusStudent).mockResolvedValue({ data: { lat: null, lng: null } } as never)
    const w = await mountView()
    await pickAddress(w, { id: null, lat: null, lng: null, address: '住家地址', reason: 'selected' })
    expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('地圖微調'))
    expect(s.setPickupAddress).toHaveBeenCalledWith(0, {
      id: null, lat: null, lng: null, address: '住家地址',
    })
  })

  it('地址簿的地址本來就有座標，不多打一次 geocode', async () => {
    const w = await mountView()
    await pickAddress(w, { id: 7, lat: 22.7, lng: 120.4, address: '阿嬤家', reason: 'selected' })
    expect(geocodeBusStudent).not.toHaveBeenCalled()
  })

  it('原本就用住家且已有（微調好的）座標的站，重選住家不得用 geocode 覆寫', async () => {
    // fixture 預設 pickup_address_id: null ＋ lat/lng 非 null＝「用住家、已微調」。
    // 這裡若照樣 geocode，巷弄級結果會把微調好的上下車點蓋掉；lat/lng 送 null
    // 交給 composable setPickupAddress 的 sameAddress 分支保留既有座標。
    vi.mocked(geocodeBusStudent).mockResolvedValue({ data: { lat: 22.65, lng: 120.35 } } as never)
    const w = await mountView()
    await pickAddress(w, { id: null, lat: null, lng: null, address: '住家地址', reason: 'selected' })
    expect(geocodeBusStudent).not.toHaveBeenCalled()
    expect(s.setPickupAddress).toHaveBeenCalledWith(0, {
      id: null, lat: null, lng: null, address: '住家地址',
    })
  })

  it('刪除選中地址被動退回住家（reason: fallback）不關 Dialog；主動選定才關', async () => {
    // 站點原本指向被刪的那筆（id 7）→ 與住家 id 不同，照樣補 geocode。
    s.stops.value = [stop({ pickup_address_id: 7 })]
    vi.mocked(geocodeBusStudent).mockResolvedValue({ data: { lat: 22.65, lng: 120.35 } } as never)
    const w = await mountView()
    await pickAddress(w, { id: null, lat: null, lng: null, address: '住家地址', reason: 'fallback' })
    expect(geocodeBusStudent).toHaveBeenCalledWith(101)
    // Dialog 還開著：使用者是在管理地址簿，不是選完要離開
    const dialog = w.findAllComponents({ name: 'ElDialog' })
      .find((d) => d.props('title') === '設定接送地址')
    expect(dialog?.props('modelValue')).toBe(true)
    await pickAddress(w, { id: null, lat: 22.65, lng: 120.35, address: '住家地址', reason: 'selected' })
    expect(dialog?.props('modelValue')).toBe(false)
  })
})

describe('BusRoutesView — 地址選單自動補到住家座標（reason: located）', () => {
  function locate(w: ReturnType<typeof mount>, resolved: Record<string, unknown>) {
    w.findComponent({ name: 'BusRouteStopsTable' }).vm.$emit('pick-address', 0)
    return w.vm.$nextTick().then(() => {
      w.findComponent({ name: 'BusPickupAddressSelect' }).vm.$emit('resolved', resolved)
      return flushPromises()
    })
  }
  const LOCATED = { id: null, lat: 22.65, lng: 120.35, address: '住家地址', reason: 'located' }

  it('站點用住家且還沒座標：直接填進站點、不再打 geocode、Dialog 不關（不是使用者選定）', async () => {
    s.stops.value = [stop({ pickup_address_id: null, lat: null, lng: null, address_snapshot: null })]
    const w = await mountView()
    await locate(w, LOCATED)
    expect(geocodeBusStudent).not.toHaveBeenCalled()
    expect(s.setPickupAddress).toHaveBeenCalledWith(0, {
      id: null, lat: 22.65, lng: 120.35, address: '住家地址',
    })
    expect(ElMessage.success).toHaveBeenCalledWith(expect.stringContaining('住家座標'))
    const dialog = w.findAllComponents({ name: 'ElDialog' })
      .find((d) => d.props('title') === '設定接送地址')
    expect(dialog?.props('modelValue')).toBe(true)
  })

  it('站點已有（微調好的）座標：located 一律不動站點，也不標 dirty', async () => {
    // fixture 預設 pickup_address_id: null ＋ lat/lng 非 null＝「用住家、已微調」
    const w = await mountView()
    await locate(w, LOCATED)
    expect(s.setPickupAddress).not.toHaveBeenCalled()
    expect(s.setCoordinates).not.toHaveBeenCalled()
  })

  it('located 但仍查無座標（geocode 失敗）：不寫入 null 座標', async () => {
    s.stops.value = [stop({ pickup_address_id: null, lat: null, lng: null, address_snapshot: null })]
    const w = await mountView()
    await locate(w, { ...LOCATED, lat: null, lng: null })
    expect(s.setPickupAddress).not.toHaveBeenCalled()
  })
})

describe('BusRoutesView — 接送地址 Dialog 內重新定位', () => {
  function openDialogAndRelocate(
    w: ReturnType<typeof mount>, payload: { id: number; lat: number | null; lng: number | null },
  ) {
    w.findComponent({ name: 'BusRouteStopsTable' }).vm.$emit('pick-address', 0)
    return w.vm.$nextTick().then(() => {
      w.findComponent({ name: 'BusPickupAddressSelect' }).vm.$emit('relocated', payload)
      return flushPromises()
    })
  }

  it('重新定位的地址正是這一站目前用的那筆，直接覆寫座標（跳過 sameAddress 保護）', async () => {
    s.stops.value = [stop({ pickup_address_id: 7, lat: 22.61, lng: 120.31 })]
    const w = await mountView()
    await openDialogAndRelocate(w, { id: 7, lat: 22.9, lng: 120.6 })
    expect(s.setCoordinates).toHaveBeenCalledWith(101, 22.9, 120.6)
  })

  it('重新定位的地址不是這一站目前用的那筆（純管理地址簿），不動這一站的座標', async () => {
    s.stops.value = [stop({ pickup_address_id: 7, lat: 22.61, lng: 120.31 })]
    const w = await mountView()
    await openDialogAndRelocate(w, { id: 9, lat: 22.9, lng: 120.6 })
    expect(s.setCoordinates).not.toHaveBeenCalled()
  })

  it('重新定位仍查無座標，不寫入 null 座標', async () => {
    s.stops.value = [stop({ pickup_address_id: 7, lat: 22.61, lng: 120.31 })]
    const w = await mountView()
    await openDialogAndRelocate(w, { id: 7, lat: null, lng: null })
    expect(s.setCoordinates).not.toHaveBeenCalled()
  })
})

describe('BusRoutesView — 名單表格「重新定位」', () => {
  it('住家地址（pickup_address_id 為 null）重新定位走 geocodeBusStudent', async () => {
    s.stops.value = [stop({ pickup_address_id: null })]
    vi.mocked(geocodeBusStudent).mockResolvedValue({ data: { lat: 22.9, lng: 120.6 } } as never)
    const w = await mountView()
    w.findComponent({ name: 'BusRouteStopsTable' }).vm.$emit('relocate', 0)
    await flushPromises()
    expect(geocodeBusStudent).toHaveBeenCalledWith(101)
    expect(relocateStudentPickupAddress).not.toHaveBeenCalled()
    expect(s.setCoordinates).toHaveBeenCalledWith(101, 22.9, 120.6)
    expect(ElMessage.success).toHaveBeenCalledWith(expect.stringContaining('已重新定位'))
  })

  it('地址簿地址（pickup_address_id 非 null）重新定位走 relocate 端點', async () => {
    s.stops.value = [stop({ pickup_address_id: 7 })]
    vi.mocked(relocateStudentPickupAddress).mockResolvedValue({ data: { lat: 22.9, lng: 120.6 } } as never)
    const w = await mountView()
    w.findComponent({ name: 'BusRouteStopsTable' }).vm.$emit('relocate', 0)
    await flushPromises()
    expect(relocateStudentPickupAddress).toHaveBeenCalledWith(101, 7)
    expect(geocodeBusStudent).not.toHaveBeenCalled()
    expect(s.setCoordinates).toHaveBeenCalledWith(101, 22.9, 120.6)
  })

  it('重新定位仍查無座標要提示改用地圖微調，不寫入座標', async () => {
    s.stops.value = [stop({ pickup_address_id: 7 })]
    vi.mocked(relocateStudentPickupAddress).mockResolvedValue({ data: { lat: null, lng: null } } as never)
    const w = await mountView()
    w.findComponent({ name: 'BusRouteStopsTable' }).vm.$emit('relocate', 0)
    await flushPromises()
    expect(s.setCoordinates).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('地圖微調'))
  })

  it('重新定位 API 失敗要顯示錯誤訊息', async () => {
    s.stops.value = [stop({ pickup_address_id: 7 })]
    vi.mocked(relocateStudentPickupAddress).mockRejectedValue({
      response: { status: 500, data: { detail: 'boom' } },
    })
    const w = await mountView()
    w.findComponent({ name: 'BusRouteStopsTable' }).vm.$emit('relocate', 0)
    await flushPromises()
    expect(ElMessage.error).toHaveBeenCalled()
  })
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

describe('BusRoutesView — in-flight 編輯鎖與 loading 拆分', () => {
  it('重算 ETA in-flight 時鎖住加入／帶入／儲存與表格（完成後的重讀會清掉這期間的編輯）', async () => {
    s.recomputingEtas.value = true
    const w = await mountView()
    w.findComponent('[data-testid="bus-student-select"]').vm.$emit('update:modelValue', 103)
    await flushPromises()
    expect(w.find('[data-testid="bus-add-stop"]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-testid="bus-copy-from"]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-testid="bus-save"]').attributes('disabled')).toBeDefined()
    expect(w.findComponent({ name: 'BusRouteStopsTable' }).props('readonly')).toBe(true)
  })

  it('儲存 in-flight 也走同一組鎖', async () => {
    s.saving.value = true
    const w = await mountView()
    expect(w.find('[data-testid="bus-copy-from"]').attributes('disabled')).toBeDefined()
    expect(w.findComponent({ name: 'BusRouteStopsTable' }).props('readonly')).toBe(true)
  })

  it('重算 ETA 只轉自己的 loading，「自動排序」不跟著轉（反之亦然）', async () => {
    s.recomputingEtas.value = true
    const w = await mountView()
    expect(w.find('[data-testid="bus-recompute-etas"]').classes()).toContain('is-loading')
    expect(w.find('[data-testid="bus-optimize"]').classes()).not.toContain('is-loading')
  })
})

describe('BusRoutesView — reorder 沒寫進去時側欄要重繪', () => {
  it('reorderRoutes 回 false（取消或失敗）強制側欄重掛，畫面不得停在沒寫進去的順序', async () => {
    // vuedraggable 是單向 :model-value，拖放已動了 DOM；props 沒變不會重繪，
    // 只能換 key 重掛，讓側欄依 props（實際 sort_order）重新渲染。
    s.reorderRoutes.mockResolvedValue(false)
    const w = await mountView()
    // 以 internal instance 的 uid 判斷是否 remount（findComponent 每次回新 proxy，
    // reference 比較不可靠）
    const before = w.findComponent({ name: 'BusRouteSidebar' }).vm.$.uid
    w.findComponent({ name: 'BusRouteSidebar' }).vm.$emit('reorder', {
      direction: 'morning', ids: [5, 3],
    })
    await flushPromises()
    expect(w.findComponent({ name: 'BusRouteSidebar' }).vm.$.uid).not.toBe(before)
  })

  it('reorder 成功時不重掛（重掛會丟 draggable 的動畫與 scroll 位置）', async () => {
    s.reorderRoutes.mockResolvedValue(true)
    const w = await mountView()
    const before = w.findComponent({ name: 'BusRouteSidebar' }).vm.$.uid
    w.findComponent({ name: 'BusRouteSidebar' }).vm.$emit('reorder', {
      direction: 'morning', ids: [5, 3],
    })
    await flushPromises()
    expect(w.findComponent({ name: 'BusRouteSidebar' }).vm.$.uid).toBe(before)
  })
})
