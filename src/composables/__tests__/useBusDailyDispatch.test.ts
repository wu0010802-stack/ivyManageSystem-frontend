/**
 * 今日調度 composable 的守衛測試。
 *
 * 這一頁的核心風險與班次設定頁不同，集中在三處：
 * - **`GET /bus/daily-plans` 有寫入副作用**（懶生成）。日期範圍守衛若形同虛設，
 *   使用者按錯一格就在資料庫裡生出一批不該存在的 trip。
 * - **權限是雙碼且不互相蘊含**。`BUS_WRITE` 與 `BUS_IN_PROGRESS_WRITE` 分別對應
 *   planned／in_progress；判錯的後果是「只給發車後調整權的行政能改隔天的計畫」，
 *   或反過來「該救援誤標 excused 的人按不到按鈕」。
 * - **失敗不得改動本地狀態**。後端整批 422 時什麼都沒落庫，畫面若照樣更新就是說謊。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'

vi.mock('@/api/bus', () => ({
  getBusDailyPlan: vi.fn(),
  listBusRoutes: vi.fn(),
  patchBusDailyPlanStops: vi.fn(),
  optimizeBusDailyPlan: vi.fn(),
  resetBusDailyPlan: vi.fn(),
}))
vi.mock('@/utils/auth', () => ({ hasPermission: vi.fn(() => true) }))
vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
}))

import {
  getBusDailyPlan, listBusRoutes, patchBusDailyPlanStops, optimizeBusDailyPlan, resetBusDailyPlan,
} from '@/api/bus'
import { hasPermission } from '@/utils/auth'
import { useBusDailyDispatch, MAX_DAYS_AHEAD } from '@/composables/useBusDailyDispatch'

// 時間軸固定在台北 2026-08-26（週三）09:00，避免「今天」隨執行日期漂移
const LOCAL_NOW_MS = Date.UTC(2026, 7, 26, 1, 0, 0)
const TODAY = '2026-08-26'

function stop(overrides: Record<string, unknown> = {}) {
  return {
    stop_id: 11, student_id: 101, student_name: '小明', seq: 1,
    lat: 22.61, lng: 120.31, status: 'pending', excuse_reason: null,
    source: 'default', pinned: false, eta_planned: null, eta_live: null,
    address: '高雄市…', contacts: [], departed_at: null,
    ...overrides,
  }
}

function trip(overrides: Record<string, unknown> = {}) {
  return {
    id: 7, route_id: 3, direction: 'morning', trip_date: TODAY, status: 'planned',
    auto_closed: false, created_at: `${TODAY}T06:00:00`, depart_time_planned: '07:00:00',
    started_at: null, operator_employee_id: null,
    last_ping_at: null, last_lat: null, last_lng: null,
    ...overrides,
  }
}

function planItem(overrides: Record<string, unknown> = {}) {
  return {
    trip: trip(),
    stops: [stop()],
    calendar_warnings: [],
    capacity: { departed_pending: 1, capacity: 20 },
    eta_may_be_stale: false,
    ...overrides,
  }
}

function routesPayload() {
  return {
    data: {
      routes: [{
        id: 3, name: 'A 線', is_active: true, direction: 'morning',
        depart_time: '07:00:00', sort_order: 0, capacity: 20,
        // 端點會連全車名冊與家庭座標一起回；本 composable 一欄都不該留
        stops: [{ student_id: 101, student_name: '小明', seq: 1, lat: 22.9, lng: 120.9 }],
      }],
    },
  }
}

async function boot(items: unknown[] = [planItem()]) {
  vi.mocked(getBusDailyPlan).mockResolvedValue({ data: { date: TODAY, items } } as never)
  const d = useBusDailyDispatch()
  await d.load()
  await flushPromises()
  return d
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(LOCAL_NOW_MS)
  vi.mocked(hasPermission).mockReturnValue(true)
  vi.mocked(listBusRoutes).mockResolvedValue(routesPayload() as never)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('載入', () => {
  it('以今天為預設日期，並把班次名稱由 /bus/routes 併入計畫', async () => {
    const d = await boot()
    expect(d.date.value).toBe(TODAY)
    expect(vi.mocked(getBusDailyPlan).mock.calls[0][0]).toEqual({ date: TODAY })
    expect(d.plans.value[0].route_name).toBe('A 線')
    expect(d.plans.value[0].depart_time).toBe('07:00:00')
    expect(d.selectedTripId.value).toBe(7)
  })

  it('班次清單一併回傳的家庭座標不進狀態（隱私）', async () => {
    const d = await boot()
    expect(JSON.stringify(d.plans.value)).not.toContain('120.9')
  })

  it('計畫載入失敗時 loadFailed 亮起，不得讓空清單被讀成「今天沒有班次」', async () => {
    vi.mocked(getBusDailyPlan).mockRejectedValue(new Error('boom'))
    const d = useBusDailyDispatch()
    await d.load()
    expect(d.loadFailed.value).toBe(true)
    expect(d.plans.value).toEqual([])
    expect(d.loading.value).toBe(false)
  })

  it('班次表失敗只降級成編號顯示，計畫本身仍載入成功', async () => {
    vi.mocked(listBusRoutes).mockRejectedValue(new Error('boom'))
    const d = await boot()
    expect(d.loadFailed.value).toBe(false)
    expect(d.plans.value[0].route_name).toBe('班次 #3')
    // depart_time 退回 trip 自己的 depart_time_planned，不變成空字串
    expect(d.plans.value[0].depart_time).toBe('07:00:00')
  })

  it('假日警示由 calendar_warnings 匯出（顯著提示但不阻擋）', async () => {
    const d = await boot([planItem({ calendar_warnings: ['本日為假日：中秋節', '園所行事曆：校慶補假'] })])
    expect(d.holidayNotice.value).toEqual({
      is_holiday: true,
      label: '本日為假日：中秋節、園所行事曆：校慶補假',
    })
  })

  it('無警示時 holidayNotice 為 null（不顯示空的警示條）', async () => {
    const d = await boot()
    expect(d.holidayNotice.value).toBeNull()
  })
})

describe('日期範圍（GET 有寫入副作用，超界不得白跑一趟）', () => {
  it('今天與 +7 天可選', async () => {
    const d = await boot()
    expect(await d.setDate(TODAY)).toBe(true)
    expect(await d.setDate('2026-09-02')).toBe(true) // +7
  })

  it('昨天與 +8 天一律擋下，且不呼叫懶生成端點', async () => {
    const d = await boot()
    vi.mocked(getBusDailyPlan).mockClear()

    expect(await d.setDate('2026-08-25')).toBe(false)
    expect(await d.setDate('2026-09-03')).toBe(false) // +8
    expect(getBusDailyPlan).not.toHaveBeenCalled()
    expect(d.date.value).toBe(TODAY)
  })

  it('MAX_DAYS_AHEAD 與後端 daily_plans.py 對齊', () => {
    expect(MAX_DAYS_AHEAD).toBe(7)
  })
})

describe('編輯權限（雙碼、依 trip.status 分流）', () => {
  it('planned 需要 BUS_WRITE', async () => {
    vi.mocked(hasPermission).mockImplementation((code) => code === 'BUS_WRITE')
    const d = await boot()
    expect(d.editable.value).toBe(true)
    expect(d.lockedByPermission.value).toBe(false)
  })

  it('planned 但只持 BUS_IN_PROGRESS_WRITE 時唯讀（兩碼不互相蘊含）', async () => {
    vi.mocked(hasPermission).mockImplementation((code) => code === 'BUS_IN_PROGRESS_WRITE')
    const d = await boot()
    expect(d.editable.value).toBe(false)
    expect(d.lockedByPermission.value).toBe(true)
  })

  it('in_progress 需要 BUS_IN_PROGRESS_WRITE；只持 BUS_WRITE 不夠', async () => {
    vi.mocked(hasPermission).mockImplementation((code) => code === 'BUS_WRITE')
    const d = await boot([planItem({ trip: trip({ status: 'in_progress' }) })])
    expect(d.inProgress.value).toBe(true)
    expect(d.editable.value).toBe(false)
    expect(d.lockedByPermission.value).toBe(true)
  })

  it('completed／expired 一律唯讀，且不算「權限不足」（文案不同）', async () => {
    for (const status of ['completed', 'expired']) {
      const d = await boot([planItem({ trip: trip({ status }) })])
      expect(d.editable.value).toBe(false)
      expect(d.lockedByPermission.value).toBe(false)
    }
  })
})

describe('站點編輯', () => {
  function patchResponse(stops: unknown[], capacity = { departed_pending: 1, capacity: 20 }) {
    return { data: { trip: trip(), stops, capacity } }
  }

  it('標記 excused 送 excuse:[student_id]，並以回應重填站點', async () => {
    const d = await boot()
    vi.mocked(patchBusDailyPlanStops).mockResolvedValue(
      patchResponse([stop({ status: 'excused', excuse_reason: 'admin' })]) as never,
    )
    expect(await d.markExcusedAdmin(101)).toBe(true)
    expect(vi.mocked(patchBusDailyPlanStops).mock.calls[0]).toEqual([7, { excuse: [101] }])
    expect(d.plans.value[0].stops[0].status).toBe('excused')
    expect(d.plans.value[0].stops[0].excuse_reason).toBe('admin')
  })

  it('取消 excused 送 unexcuse:[student_id]（in_progress 誤標的救援路徑）', async () => {
    const d = await boot([planItem({
      trip: trip({ status: 'in_progress' }),
      stops: [stop({ status: 'excused', excuse_reason: 'parent' })],
    })])
    vi.mocked(patchBusDailyPlanStops).mockResolvedValue(patchResponse([stop()]) as never)
    expect(await d.unmarkExcused(101)).toBe(true)
    expect(vi.mocked(patchBusDailyPlanStops).mock.calls[0]).toEqual([7, { unexcuse: [101] }])
    expect(d.plans.value[0].stops[0].status).toBe('pending')
  })

  it('失敗時完全不動本地狀態（後端整批 422 什麼都沒落庫）', async () => {
    const d = await boot()
    const before = JSON.stringify(d.plans.value)
    vi.mocked(patchBusDailyPlanStops).mockRejectedValue(new Error('422'))
    expect(await d.markExcusedAdmin(101)).toBe(false)
    expect(JSON.stringify(d.plans.value)).toBe(before)
    expect(d.saving.value).toBe(false)
  })

  it('拖拉重排送出「重排後的全部 pending student_id」，不是被移動的那一個', async () => {
    const d = await boot([planItem({
      stops: [
        stop({ stop_id: 10, student_id: 100, seq: 1, status: 'departed' }),
        stop({ stop_id: 11, student_id: 101, seq: 2 }),
        stop({ stop_id: 12, student_id: 102, seq: 3 }),
        stop({ stop_id: 13, student_id: 103, seq: 4 }),
      ],
    })])
    vi.mocked(patchBusDailyPlanStops).mockResolvedValue(patchResponse([stop()]) as never)

    // pending 序列 = [101, 102, 103]；把第 3 個搬到最前
    expect(await d.moveStop(2, 0)).toBe(true)
    expect(vi.mocked(patchBusDailyPlanStops).mock.calls[0]).toEqual([
      7, { reorder: [103, 101, 102] },
    ])
  })

  it('已 departed 的站不進 reorder 清單（後端要求恰好等於 pending 集合）', async () => {
    const d = await boot([planItem({
      stops: [
        stop({ stop_id: 10, student_id: 100, seq: 1, status: 'departed' }),
        stop({ stop_id: 12, student_id: 102, seq: 2, status: 'excused', excuse_reason: 'leave' }),
        stop({ stop_id: 11, student_id: 101, seq: 3 }),
        stop({ stop_id: 13, student_id: 103, seq: 4 }),
      ],
    })])
    vi.mocked(patchBusDailyPlanStops).mockResolvedValue(patchResponse([stop()]) as never)

    await d.moveStop(1, 0)
    const [, payload] = vi.mocked(patchBusDailyPlanStops).mock.calls[0]
    expect(payload).toEqual({ reorder: [103, 101] })
  })

  it('索引越界或原地不動時不送出請求', async () => {
    const d = await boot()
    expect(await d.moveStop(0, 0)).toBe(false)
    expect(await d.moveStop(-1, 0)).toBe(false)
    expect(await d.moveStop(0, 5)).toBe(false)
    expect(patchBusDailyPlanStops).not.toHaveBeenCalled()
  })

  it('插入學生送 inserts:[payload]，地址與座標原樣帶出', async () => {
    const d = await boot()
    vi.mocked(patchBusDailyPlanStops).mockResolvedValue(patchResponse([stop()]) as never)
    await d.insertStop({ student_id: 202, pickup_address_id: 9, lat: 22.7, lng: 120.4 })
    expect(vi.mocked(patchBusDailyPlanStops).mock.calls[0]).toEqual([
      7, { inserts: [{ student_id: 202, pickup_address_id: 9, lat: 22.7, lng: 120.4 }] },
    ])
  })
})

describe('ETA 過期與超載旗標', () => {
  it('eta_may_be_stale 透傳給 view（不默默顯示可能失真的 ETA）', async () => {
    const d = await boot([planItem({ eta_may_be_stale: true })])
    expect(d.etaStale.value).toBe(true)
  })

  it('departed+pending 超過 capacity 時亮警示，但不擋任何動作', async () => {
    const d = await boot([planItem({ capacity: { departed_pending: 21, capacity: 20 } })])
    expect(d.overCapacity.value).toBe(true)
    expect(d.editable.value).toBe(true) // 銷假還原造成的超額不得反過來鎖住編輯
  })

  it('恰好等於 capacity 不算超載', async () => {
    const d = await boot([planItem({ capacity: { departed_pending: 20, capacity: 20 } })])
    expect(d.overCapacity.value).toBe(false)
  })
})

describe('自動排序（預覽 → 套用）', () => {
  it('預覽以 apply:false 呼叫，不落庫', async () => {
    const d = await boot()
    vi.mocked(optimizeBusDailyPlan).mockResolvedValue({
      data: { applied: false, stops: [{ student_id: 101, seq: 1, eta_planned: null }],
        end_time_estimated: null, moved_unpinned_student_ids: [101] },
    } as never)
    await d.optimizePreview()
    expect(vi.mocked(optimizeBusDailyPlan).mock.calls[0]).toEqual([7, { apply: false }])
    expect(d.optimizePreviewData.value?.moved_unpinned_student_ids).toEqual([101])
    expect(d.optimizeError.value).toBeNull()
  })

  it('Azure 502 時留下錯誤訊息供重試，且不產生預覽（不假裝排序成功）', async () => {
    const d = await boot()
    vi.mocked(optimizeBusDailyPlan).mockRejectedValue(new Error('502'))
    await d.optimizePreview()
    expect(d.optimizePreviewData.value).toBeNull()
    expect(d.optimizeError.value).toBeTruthy()
    expect(d.optimizing.value).toBe(false)
  })

  it('套用以 apply:true 呼叫並重載當日計畫（optimize 只回順序，狀態仍以 GET 為權威）', async () => {
    const d = await boot()
    vi.mocked(optimizeBusDailyPlan).mockResolvedValue({
      data: { applied: true, stops: [], end_time_estimated: null, moved_unpinned_student_ids: [] },
    } as never)
    vi.mocked(getBusDailyPlan).mockClear()

    expect(await d.applyOptimize()).toBe(true)
    expect(vi.mocked(optimizeBusDailyPlan).mock.calls.at(-1)).toEqual([7, { apply: true }])
    expect(getBusDailyPlan).toHaveBeenCalledTimes(1)
    expect(d.optimizePreviewData.value).toBeNull()
  })

  it('換班次會清掉前一個班次的預覽（否則會把 A 線的順序套到 B 線上）', async () => {
    const d = await boot([
      planItem(),
      planItem({ trip: trip({ id: 8, route_id: 4 }) }),
    ])
    vi.mocked(optimizeBusDailyPlan).mockResolvedValue({
      data: { applied: false, stops: [], end_time_estimated: null, moved_unpinned_student_ids: [] },
    } as never)
    await d.optimizePreview()
    expect(d.optimizePreviewData.value).not.toBeNull()

    d.selectTrip(8)
    expect(d.optimizePreviewData.value).toBeNull()
  })
})

describe('重設為預設名單', () => {
  it('成功後以回應重填站點（二次確認由 view 負責，composable 不攔）', async () => {
    const d = await boot([planItem({ stops: [stop({ source: 'added' })] })])
    vi.mocked(resetBusDailyPlan).mockResolvedValue({
      data: { trip: trip(), stops: [stop({ source: 'default' })] },
    } as never)

    expect(await d.resetPlan()).toBe(true)
    expect(vi.mocked(resetBusDailyPlan).mock.calls[0]).toEqual([7])
    expect(d.plans.value[0].stops[0].source).toBe('default')
  })

  it('失敗（in_progress 重設後超 capacity 的 422）不動本地狀態', async () => {
    const d = await boot()
    const before = JSON.stringify(d.plans.value)
    vi.mocked(resetBusDailyPlan).mockRejectedValue(new Error('422'))
    expect(await d.resetPlan()).toBe(false)
    expect(JSON.stringify(d.plans.value)).toBe(before)
  })
})
