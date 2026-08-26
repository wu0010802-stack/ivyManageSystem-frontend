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
vi.mock('@/api/students', () => ({ getStudents: vi.fn() }))
// 「今天」必須用**台北**時鐘（後端 `today_taipei()`），不是瀏覽器本地時鐘。
// 這台機器與 CI 都可能是 Asia/Taipei，兩者剛好一致 → 用系統時間測不出差別。
// 故把 `todayTaipeiISO` 換成固定值、且**刻意與系統時間所在的日期不同**：
// 若實作退回 `todayISO()`（本地時鐘），`date` 初值就不會是這個值，測試立刻紅。
vi.mock('@/utils/format', async () => {
  const actual = await vi.importActual<typeof import('@/utils/format')>('@/utils/format')
  return { ...actual, todayTaipeiISO: vi.fn(() => '2026-08-26') }
})
vi.mock('@/utils/auth', () => ({ hasPermission: vi.fn(() => true) }))
vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
}))

import {
  getBusDailyPlan, listBusRoutes, patchBusDailyPlanStops, optimizeBusDailyPlan, resetBusDailyPlan,
} from '@/api/bus'
import { getStudents } from '@/api/students'
import { hasPermission } from '@/utils/auth'
import { useBusDailyDispatch, MAX_DAYS_AHEAD } from '@/composables/useBusDailyDispatch'

// 系統時間刻意設在**別的月份**（2026-01-15），台北「今天」則由上面的 mock 固定成
// 2026-08-26——兩者不同才能證明實作讀的是台北時鐘而不是本地時鐘。
const LOCAL_NOW_MS = Date.UTC(2026, 0, 15, 1, 0, 0)
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
  vi.mocked(getStudents).mockResolvedValue({
    data: {
      items: [
        // 端點還會回家長姓名／電話／住址；composable 只該留 id/name
        { id: 101, name: '小明', address: '不該進狀態的住址' },
        { id: 201, name: '小華' },
        { id: 202, name: '小美' },
      ],
      total: 3,
    },
  } as never)
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

  it('站點座標完全不進狀態——本頁不需要，而 Sentry 的 propsData 沒有 lat/lng denylist', async () => {
    const d = await boot()
    const stopState = d.plans.value[0].stops[0] as Record<string, unknown>
    expect(stopState).not.toHaveProperty('lat')
    expect(stopState).not.toHaveProperty('lng')
    // 其餘欄位照常帶進來，不是把整個 stop 砍掉
    expect(stopState.student_name).toBe('小明')
    expect(stopState.address).toBe('高雄市…')
    expect(JSON.stringify(d.plans.value)).not.toContain('22.61')
    expect(JSON.stringify(d.plans.value)).not.toContain('120.31')
  })

  it('PATCH 與 reset 回應的座標同樣不落進狀態', async () => {
    const d = await boot()
    vi.mocked(patchBusDailyPlanStops).mockResolvedValue({
      data: {
        trip: trip(),
        stops: [stop({ lat: 25.55, lng: 121.55 })],
        capacity: { departed_pending: 1, capacity: 20 },
      },
    } as never)
    await d.markExcusedAdmin(101)
    expect(JSON.stringify(d.plans.value)).not.toContain('25.55')

    vi.mocked(resetBusDailyPlan).mockResolvedValue({
      data: { trip: trip(), stops: [stop({ lat: 26.66, lng: 122.66 })] },
    } as never)
    await d.resetPlan()
    expect(JSON.stringify(d.plans.value)).not.toContain('26.66')
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

  it('「今天」讀台北時鐘而非瀏覽器本地時鐘（後端用 today_taipei）', async () => {
    // mock 的 todayTaipeiISO 回 2026-08-26，系統時間卻在 2026-01-15。
    // 若實作退回 todayISO()，date 初值會是 2026-01-15，下面兩條都會紅。
    //
    // 真實世界的失效情境：台北 00:30（＝UTC 前一日 16:30），裝置時區非台北 →
    // 本地「今天」還是昨天 → 進頁就送出後端眼中已過期的 date → 422 → 整頁只剩
    // 「無法取得當日計畫」。上界反向同理（東京在台北 23:30 後會放行到後端的 +8 天）。
    const d = await boot()
    expect(d.date.value).toBe('2026-08-26')
    expect(vi.mocked(getBusDailyPlan).mock.calls[0][0]).toEqual({ date: '2026-08-26' })
  })

  it('日期範圍守衛也以台北今天為基準（本地日期不得影響上下界）', async () => {
    const d = await boot()
    // 以本地時鐘（2026-01-15）算的話，這兩個日期會落在完全不同的區間
    expect(await d.setDate('2026-01-15')).toBe(false) // 本地的「今天」，台北眼中是過去
    expect(await d.setDate('2026-09-02')).toBe(true) // 台北今天 +7
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

  it('失敗時把後端 detail 存進 lastError（那句話才告訴使用者去哪裡改）', async () => {
    const d = await boot()
    vi.mocked(patchBusDailyPlanStops).mockRejectedValue({
      response: { data: { detail: '學生 202 今日已排入其他班次「B 線」' } },
    })
    expect(await d.insertStop({ student_id: 202 })).toBe(false)
    expect(d.lastError.value).toBe('學生 202 今日已排入其他班次「B 線」')
  })

  it('成功時清掉 lastError，不讓上一次的錯誤黏在畫面上', async () => {
    const d = await boot()
    vi.mocked(patchBusDailyPlanStops).mockRejectedValue(new Error('422'))
    await d.markExcusedAdmin(101)
    expect(d.lastError.value).toBeTruthy()

    vi.mocked(patchBusDailyPlanStops).mockResolvedValue({
      data: { trip: trip(), stops: [stop()], capacity: { departed_pending: 1, capacity: 20 } },
    } as never)
    await d.markExcusedAdmin(101)
    expect(d.lastError.value).toBeNull()
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

  it('往後拖也要對：把第一個 pending 拖到最後', async () => {
    // 後端 reorder 只檢查「集合相等」不檢查順序意圖（daily_plans.py 的
    // `set(body.reorder) != pending_ids`），所以順序算錯不會 422，會**靜默寫入
    // 錯誤的接送順序**——往前拖與往後拖必須各有一則守衛。
    const d = await boot([planItem({
      stops: [
        stop({ stop_id: 11, student_id: 101, seq: 1 }),
        stop({ stop_id: 12, student_id: 102, seq: 2 }),
        stop({ stop_id: 13, student_id: 103, seq: 3 }),
      ],
    })])
    vi.mocked(patchBusDailyPlanStops).mockResolvedValue({
      data: { trip: trip(), stops: [stop()], capacity: { departed_pending: 1, capacity: 20 } },
    } as never)

    expect(await d.moveStop(0, 2)).toBe(true)
    expect(vi.mocked(patchBusDailyPlanStops).mock.calls[0]).toEqual([
      7, { reorder: [102, 103, 101] },
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

describe('臨時插入的候選學生', () => {
  it('進頁不撈全園名冊（延後到開啟 Dialog 才載），且只留 id/name', async () => {
    const d = await boot()
    expect(getStudents).not.toHaveBeenCalled()

    await d.loadStudents()
    expect(d.students.value).toEqual([
      { id: 101, name: '小明' }, { id: 201, name: '小華' }, { id: 202, name: '小美' },
    ])
    expect(JSON.stringify(d.students.value)).not.toContain('住址')
  })

  it('缺名的學生退成編號，不變成一個點得下去的空白選項', async () => {
    vi.mocked(getStudents).mockResolvedValue({
      data: { items: [{ id: 301, name: '' }, { id: 302, name: null }], total: 2 },
    } as never)
    const d = await boot([planItem({ stops: [] })])
    await d.loadStudents()
    expect(d.students.value).toEqual([
      { id: 301, name: '學生 #301' },
      { id: 302, name: '學生 #302' },
    ])
  })

  it('載過一次就不重載（同一次進頁內名冊不會變）', async () => {
    const d = await boot()
    await d.loadStudents()
    await d.loadStudents()
    expect(getStudents).toHaveBeenCalledTimes(1)
  })

  it('學生清單失敗時 studentsFailed 亮起，不得讓空候選被讀成「沒有人可插入」', async () => {
    vi.mocked(getStudents).mockRejectedValue(new Error('boom'))
    const d = await boot()
    await d.loadStudents()
    expect(d.studentsFailed.value).toBe(true)
    expect(d.insertCandidates.value).toEqual([])
  })

  it('排掉已在本班次名單上的學生（含 excused——那要用「取消不搭車」而非重新插入）', async () => {
    const d = await boot([planItem({
      stops: [
        stop({ student_id: 101 }),
        stop({ stop_id: 12, student_id: 201, status: 'excused', excuse_reason: 'parent' }),
      ],
    })])
    await d.loadStudents()
    expect(d.insertCandidates.value.map((s) => s.id)).toEqual([202])
  })

  it('排掉同日同方向其他班次上的非 excused 學生（後端跨班次重複整批 422）', async () => {
    const d = await boot([
      planItem({ stops: [stop({ student_id: 101 })] }),
      planItem({
        trip: trip({ id: 8, route_id: 4, direction: 'morning' }),
        stops: [
          stop({ stop_id: 20, student_id: 201 }),
          stop({ stop_id: 21, student_id: 202, status: 'excused', excuse_reason: 'leave' }),
        ],
      }),
    ])
    await d.loadStudents()
    // 101 在本班次、201 在同方向別班次；202 在別班次但已 excused → 可插入
    expect(d.insertCandidates.value.map((s) => s.id)).toEqual([202])
  })

  it('反方向的班次不構成衝突（早上 A 線接、下午 B 線送是正常排法）', async () => {
    const d = await boot([
      planItem({ stops: [stop({ student_id: 101 })] }),
      planItem({
        trip: trip({ id: 8, route_id: 4, direction: 'afternoon' }),
        stops: [stop({ stop_id: 20, student_id: 201 })],
      }),
    ])
    await d.loadStudents()
    expect(d.insertCandidates.value.map((s) => s.id)).toEqual([201, 202])
  })
})

describe('ETA 過期與超載旗標', () => {
  it('eta_may_be_stale 透傳給 view（不默默顯示可能失真的 ETA）', async () => {
    const d = await boot([planItem({ eta_may_be_stale: true })])
    expect(d.etaStale.value).toBe(true)
  })

  it('標記不搭車之後 etaStale 立刻成立——PATCH 回應不帶 eta_may_be_stale，不可沿用舊快照', async () => {
    const d = await boot([planItem({ eta_may_be_stale: false })])
    expect(d.etaStale.value).toBe(false)

    // 後端此刻已認定 stale（少一站後平移出來的 eta_planned 就失真），但
    // DailyPlanStopsPatchOut 沒有這個欄位——只讀伺服器快照的話警示永遠不會亮
    vi.mocked(patchBusDailyPlanStops).mockResolvedValue({
      data: {
        trip: trip(),
        stops: [stop({ status: 'excused', excuse_reason: 'admin' })],
        capacity: { departed_pending: 0, capacity: 20 },
      },
    } as never)
    await d.markExcusedAdmin(101)
    expect(d.etaStale.value).toBe(true)
  })

  it('departed+pending 超過 capacity 時亮警示，但不擋任何動作', async () => {
    const d = await boot([planItem({
      capacity: { departed_pending: 3, capacity: 2 },
      stops: [
        stop({ stop_id: 10, student_id: 100, status: 'departed' }),
        stop({ stop_id: 11, student_id: 101, status: 'pending' }),
        stop({ stop_id: 12, student_id: 102, status: 'pending' }),
      ],
    })])
    expect(d.departedPending.value).toBe(3)
    expect(d.overCapacity.value).toBe(true)
    expect(d.editable.value).toBe(true) // 銷假還原造成的超額不得反過來鎖住編輯
  })

  it('恰好等於 capacity 不算超載', async () => {
    const d = await boot([planItem({
      capacity: { departed_pending: 2, capacity: 2 },
      stops: [
        stop({ stop_id: 11, student_id: 101, status: 'pending' }),
        stop({ stop_id: 12, student_id: 102, status: 'pending' }),
      ],
    })])
    expect(d.overCapacity.value).toBe(false)
  })

  it('載客數只算 departed + pending，excused／skipped 不計', async () => {
    const d = await boot([planItem({
      stops: [
        stop({ stop_id: 10, student_id: 100, status: 'departed' }),
        stop({ stop_id: 11, student_id: 101, status: 'pending' }),
        stop({ stop_id: 12, student_id: 102, status: 'excused', excuse_reason: 'leave' }),
        stop({ stop_id: 13, student_id: 103, status: 'skipped' }),
      ],
    })])
    expect(d.departedPending.value).toBe(2)
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

  it('重設後載客數與超載警示跟著更新——DailyPlanResetOut 沒有 capacity 欄位', async () => {
    const d = await boot([planItem({
      capacity: { departed_pending: 0, capacity: 1 },
      stops: [stop({ status: 'excused', excuse_reason: 'admin' })],
    })])
    expect(d.departedPending.value).toBe(0)
    expect(d.overCapacity.value).toBe(false)

    vi.mocked(resetBusDailyPlan).mockResolvedValue({
      data: {
        trip: trip(),
        stops: [
          stop({ stop_id: 11, student_id: 101 }),
          stop({ stop_id: 12, student_id: 102 }),
        ],
      },
    } as never)
    expect(await d.resetPlan()).toBe(true)
    expect(d.departedPending.value).toBe(2)
    expect(d.overCapacity.value).toBe(true)
  })

  it('失敗（in_progress 重設後超 capacity 的 422）不動本地狀態', async () => {
    const d = await boot()
    const before = JSON.stringify(d.plans.value)
    vi.mocked(resetBusDailyPlan).mockRejectedValue(new Error('422'))
    expect(await d.resetPlan()).toBe(false)
    expect(JSON.stringify(d.plans.value)).toBe(before)
  })
})
