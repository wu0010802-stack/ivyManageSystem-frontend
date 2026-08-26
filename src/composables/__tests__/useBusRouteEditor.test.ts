/**
 * 管理端娃娃車**班次**編輯 composable 的守衛測試。
 *
 * 這一頁的風險集中在「一次操作毀掉整份名冊」：後端是整條班次 replace-all，
 * 而班次本身**沒有刪除端點**（只能停用）。因此重點守衛是
 * ①不自動建班次 ②未儲存的編輯不得靜默丟棄 ③清空要確認 ④儲存失敗不得吃掉編輯。
 *
 * 本期新增的守衛（spec「第一期契約破壞清單」與「已確認的關鍵決策」）：
 * ⑤ 跨班次重複判準改「同方向且 ride_days 有交集」——無交集是正當場景，不得誤擋
 * ⑥ 拖拉調整過的站自動釘選，否則下次自動排序會洗掉手動順序
 * ⑦ capacity 是**逐星期取 max**，不是總站數
 * ⑧ replace-all 送的是整條班次且不帶 direction
 * ⑨ 最佳化端點吃的是伺服器名單，有未儲存變更時不得拿去預覽／重算
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/api/bus', () => ({
  listBusRoutes: vi.fn(),
  createBusRoute: vi.fn(),
  replaceBusRouteStops: vi.fn(),
  updateBusRoute: vi.fn(),
  reorderBusRoutes: vi.fn(),
  copyBusRouteFrom: vi.fn(),
  optimizeBusRoute: vi.fn(),
  recomputeBusRouteEtas: vi.fn(),
}))
vi.mock('@/api/students', () => ({ getStudents: vi.fn() }))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listBusRoutes, createBusRoute, replaceBusRouteStops, updateBusRoute,
  reorderBusRoutes, copyBusRouteFrom, optimizeBusRoute, recomputeBusRouteEtas,
} from '@/api/bus'
import { getStudents } from '@/api/students'
import {
  useBusRouteEditor, MAX_STOPS_PER_ROUTE, rideDaysOverlap,
  rideDaysToWeekdays, weekdaysToRideDays, FULL_WEEK_RIDE_DAYS,
} from '@/composables/useBusRouteEditor'

const MON = 0b00001
const TUE = 0b00010
const WED = 0b00100
const THU = 0b01000
const FRI = 0b10000

function routesPayload(routes: unknown[]) {
  return { data: { routes } }
}

function stop(overrides: Record<string, unknown> = {}) {
  return {
    student_id: 101,
    student_name: '小明',
    seq: 1,
    lat: 22.61,
    lng: 120.31,
    address_snapshot: '高雄市三民區某路 1 號',
    address_stale: false,
    ride_days: FULL_WEEK_RIDE_DAYS,
    pinned: false,
    pickup_address_id: null,
    eta_planned: '07:35:00',
    ...overrides,
  }
}

/** 早上接班次（塌平回應：route 層 direction ＋單一 stops 清單）。 */
function routeA(overrides: Record<string, unknown> = {}) {
  return {
    id: 3,
    name: '早 A',
    is_active: true,
    direction: 'morning',
    depart_time: '07:30:00',
    end_time_planned: '08:10:00',
    sort_order: 0,
    capacity: 20,
    operators: [{ employee_id: 5, name: '王老師' }],
    stops: [
      stop(),
      stop({ student_id: 102, student_name: '小華', seq: 2, lat: null, lng: null, address_snapshot: null, eta_planned: null }),
    ],
    ...overrides,
  }
}

function studentsPayload(items: Array<{ id: number; name: string }>, total?: number) {
  return {
    data: {
      // 端點實際還會回家長姓名／電話／住址；刻意保留，用來咬住「只留 id/name」
      items: items.map((s) => ({
        ...s,
        parent_name: '家長',
        parent_phone: '0912345678',
        address: '高雄市三民區某路 1 號',
      })),
      total: total ?? items.length,
      skip: 0,
      limit: 500,
    },
  }
}

const DEFAULT_STUDENTS = [
  { id: 101, name: '小明' },
  { id: 102, name: '小華' },
  { id: 103, name: '小美' },
  { id: 104, name: '小強' },
]

async function boot(routes: unknown[] = [routeA()]) {
  vi.mocked(listBusRoutes).mockResolvedValue(routesPayload(routes) as never)
  const editor = useBusRouteEditor()
  await editor.init()
  return editor
}

beforeEach(() => {
  vi.mocked(getStudents).mockResolvedValue(studentsPayload(DEFAULT_STUDENTS) as never)
  vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ride_days bitmask helper', () => {
  it('bit0=週一 … bit4=週五，與後端 default 31 對齊', () => {
    expect(weekdaysToRideDays([0])).toBe(MON)
    expect(weekdaysToRideDays([4])).toBe(FRI)
    expect(weekdaysToRideDays([0, 1, 2, 3, 4])).toBe(FULL_WEEK_RIDE_DAYS)
    expect(FULL_WEEK_RIDE_DAYS).toBe(31)
    expect(rideDaysToWeekdays(MON | WED)).toEqual([0, 2])
    expect(rideDaysToWeekdays(FULL_WEEK_RIDE_DAYS)).toEqual([0, 1, 2, 3, 4])
  })

  it('週末 bit（bit5/6）不在本期 UI 範圍，轉換時不吐出來', () => {
    expect(rideDaysToWeekdays(0b1100000 | MON)).toEqual([0])
    expect(weekdaysToRideDays([5, 6])).toBe(0)
  })

  it('overlap 是交集判定，不是相等判定', () => {
    expect(rideDaysOverlap(MON | TUE, TUE | WED)).toBe(true)
    expect(rideDaysOverlap(MON | TUE | WED, THU | FRI)).toBe(false)
  })
})

describe('載入與塌平回應', () => {
  it('讀塌平回應：route 層 direction ＋單一 stops 清單（不再有 morning/afternoon 兩桶）', async () => {
    const editor = await boot()
    expect(editor.routes.value).toHaveLength(1)
    const route = editor.routes.value[0]
    expect(route.direction).toBe('morning')
    expect(route.depart_time).toBe('07:30:00')
    expect(route.end_time_planned).toBe('08:10:00')
    expect(route.capacity).toBe(20)
    expect(route.operators).toEqual([{ employee_id: 5, name: '王老師' }])
    expect(route.stops).toHaveLength(2)
  })

  it('站點帶新欄位：ride_days / pinned / pickup_address_id / eta_planned / 地址快照', async () => {
    const editor = await boot([routeA({
      stops: [stop({ ride_days: MON | WED, pinned: true, pickup_address_id: 7 })],
    })])
    expect(editor.stops.value[0]).toMatchObject({
      ride_days: MON | WED,
      pinned: true,
      pickup_address_id: 7,
      eta_planned: '07:35:00',
      address_snapshot: '高雄市三民區某路 1 號',
    })
  })

  it('缺欄位的舊回應：ride_days 退回週一~五、pinned/address_stale 一律 false（不誤報）', async () => {
    const editor = await boot([routeA({
      stops: [{ student_id: 101, student_name: '小明', seq: 1 }],
    })])
    expect(editor.stops.value[0]).toMatchObject({
      ride_days: FULL_WEEK_RIDE_DAYS, pinned: false, address_stale: false, pickup_address_id: null,
    })
  })

  it('後端尚未回聯絡人欄位時給空陣列，不是 undefined（表格顯示「—」而非炸掉）', async () => {
    const editor = await boot()
    expect(editor.stops.value[0].contacts).toEqual([])
  })

  it('學生清單只留 id/name，家長姓名／電話／住址一律不進狀態', async () => {
    const editor = await boot()
    expect(editor.students.value[0]).toEqual({ id: 101, name: '小明' })
    expect(JSON.stringify(editor.students.value)).not.toContain('0912345678')
  })

  it('學生清單翻頁到底，不得靜默截斷（total > 單頁時要續抓）', async () => {
    vi.mocked(getStudents)
      .mockResolvedValueOnce(studentsPayload(DEFAULT_STUDENTS.slice(0, 2), 4) as never)
      .mockResolvedValueOnce(studentsPayload(DEFAULT_STUDENTS.slice(2), 4) as never)
    const editor = await boot()
    expect(editor.students.value).toHaveLength(4)
    expect(getStudents).toHaveBeenCalledTimes(2)
  })

  it('班次載入失敗要 loadFailed，不得讓畫面把「連不上」講成「沒有班次」', async () => {
    vi.mocked(listBusRoutes).mockRejectedValue(new Error('boom'))
    const editor = useBusRouteEditor()
    await editor.init()
    expect(editor.loadFailed.value).toBe(true)
    expect(editor.routes.value).toEqual([])
  })

  it('學生清單失敗與班次失敗各自判定（allSettled，不互相掩蓋）', async () => {
    vi.mocked(getStudents).mockRejectedValue(new Error('boom'))
    const editor = await boot()
    expect(editor.studentsFailed.value).toBe(true)
    expect(editor.loadFailed.value).toBe(false)
    expect(editor.routes.value).toHaveLength(1)
  })
})

describe('跨班次重複規則（同方向且 ride_days 有交集）', () => {
  const routeB = routeA({
    id: 5, name: '早 B', sort_order: 1,
    stops: [stop({ student_id: 103, student_name: '小美', ride_days: MON | TUE | WED })],
  })

  it('同方向、ride_days 有空檔的學生仍是候選（週一~三別班、週四五本班是正當場景）', async () => {
    const editor = await boot([routeA({ stops: [] }), routeB])
    expect(editor.candidates.value.map((s) => s.id)).toContain(103)
    expect(editor.freeRideDaysFor(103)).toBe(THU | FRI)
  })

  it('同方向已被別班佔滿週一~五的學生才排除', async () => {
    const full = routeA({
      id: 5, name: '早 B',
      stops: [stop({ student_id: 103, student_name: '小美', ride_days: FULL_WEEK_RIDE_DAYS })],
    })
    const editor = await boot([routeA({ stops: [] }), full])
    expect(editor.candidates.value.map((s) => s.id)).not.toContain(103)
  })

  it('不同方向不算重複——下午班不受早上班的名單影響', async () => {
    const pm = routeA({
      id: 9, name: '午 A', direction: 'afternoon',
      stops: [stop({ student_id: 103, student_name: '小美', ride_days: FULL_WEEK_RIDE_DAYS })],
    })
    const editor = await boot([routeA({ stops: [] }), pm])
    expect(editor.candidates.value.map((s) => s.id)).toContain(103)
    expect(editor.freeRideDaysFor(103)).toBe(FULL_WEEK_RIDE_DAYS)
  })

  it('加入有空檔的學生時，只預選剩餘星期（避免送出必定 422）', async () => {
    const editor = await boot([routeA({ stops: [] }), routeB])
    editor.addStop(103)
    expect(editor.stops.value[0].ride_days).toBe(THU | FRI)
    expect(ElMessage.info).toHaveBeenCalled()
  })

  it('setRideDays 勾到別班已佔用的星期直接擋下並指出衝突班次', async () => {
    const editor = await boot([routeA({ stops: [] }), routeB])
    editor.addStop(103)
    editor.setRideDays(0, MON | THU)
    expect(editor.stops.value[0].ride_days).toBe(THU | FRI)
    expect(ElMessage.error).toHaveBeenCalledWith(expect.stringContaining('早 B'))
  })

  it('setRideDays 一天都不選要擋（後端 ride_days 有 ge=1）', async () => {
    const editor = await boot()
    editor.setRideDays(0, 0)
    expect(editor.stops.value[0].ride_days).toBe(FULL_WEEK_RIDE_DAYS)
    expect(ElMessage.warning).toHaveBeenCalled()
  })
})

describe('capacity 逐星期口徑', () => {
  it('逐星期各自計數取 max，不是總站數（30 人分散不同星期不算超載）', async () => {
    const editor = await boot([routeA({
      capacity: 2,
      stops: [
        stop({ student_id: 101, ride_days: MON | TUE }),
        stop({ student_id: 102, seq: 2, ride_days: MON | TUE }),
        stop({ student_id: 103, seq: 3, ride_days: THU | FRI }),
      ],
    })])
    expect(editor.weekdayLoads.value).toEqual([2, 2, 0, 1, 1])
    expect(editor.maxWeekdayLoad.value).toBe(2)
    expect(editor.overloadedWeekdays.value).toEqual([])
  })

  it('只要有任一星期超過 capacity 就標示該星期', async () => {
    const editor = await boot([routeA({
      capacity: 1,
      stops: [
        stop({ student_id: 101, ride_days: MON | WED }),
        stop({ student_id: 102, seq: 2, ride_days: MON }),
      ],
    })])
    expect(editor.overloadedWeekdays.value).toEqual([0])
  })
})

describe('編輯與釘選', () => {
  it('拖拉落點重排，被拖動的那一站自動釘選（防止下次自動排序洗掉手動順序）', async () => {
    const editor = await boot([routeA({
      stops: [
        stop({ student_id: 101, seq: 1 }),
        stop({ student_id: 102, seq: 2 }),
        stop({ student_id: 103, seq: 3 }),
      ],
    })])
    editor.moveStop(2, 0)
    expect(editor.stops.value.map((s) => s.student_id)).toEqual([103, 101, 102])
    expect(editor.stops.value[0].pinned).toBe(true)
    expect(editor.stops.value[1].pinned).toBe(false)
    expect(editor.stops.value.map((s) => s.seq)).toEqual([1, 2, 3])
    expect(editor.dirty.value).toBe(true)
  })

  it('釘選可一鍵解除', async () => {
    const editor = await boot([routeA({ stops: [stop({ pinned: true })] })])
    editor.togglePinned(0)
    expect(editor.stops.value[0].pinned).toBe(false)
  })

  it('setPickupAddress 的 id=null 是「住家」，且會一併帶入座標與地址文字、清掉過期旗標', async () => {
    const editor = await boot([routeA({ stops: [stop({ address_stale: true, pickup_address_id: 7 })] })])
    editor.setPickupAddress(0, { id: null, lat: 22.7, lng: 120.4, address: '住家地址' })
    expect(editor.stops.value[0]).toMatchObject({
      pickup_address_id: null, lat: 22.7, lng: 120.4,
      address_snapshot: '住家地址', address_stale: false,
    })
  })

  it('站數上限與後端對齊，超過就擋（否則是整批 422）', async () => {
    const many = Array.from({ length: MAX_STOPS_PER_ROUTE }, (_, i) => stop({
      student_id: 1000 + i, student_name: `學生${i}`, seq: i + 1,
    }))
    const editor = await boot([routeA({ stops: many })])
    editor.addStop(104)
    expect(editor.stops.value).toHaveLength(MAX_STOPS_PER_ROUTE)
    expect(ElMessage.warning).toHaveBeenCalled()
  })
})

describe('未儲存保護', () => {
  it('切換班次前要確認；使用者取消就不切', async () => {
    const editor = await boot([routeA(), routeA({ id: 5, name: '早 B', stops: [] })])
    editor.addStop(103)
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce(new Error('cancel'))
    const ok = await editor.selectRoute(5)
    expect(ok).toBe(false)
    expect(editor.activeRouteId.value).toBe(3)
  })

  it('改班次設定前也要確認（成功後會重讀而蓋掉編輯緩衝）', async () => {
    const editor = await boot()
    editor.addStop(103)
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce(new Error('cancel'))
    const ok = await editor.updateRoute(3, { capacity: 18 })
    expect(ok).toBe(false)
    expect(updateBusRoute).not.toHaveBeenCalled()
  })

  it('調整班次順序前也要確認（reorder 成功後同樣會重讀）', async () => {
    const editor = await boot([routeA(), routeA({ id: 5, name: '早 B', stops: [] })])
    editor.addStop(103)
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce(new Error('cancel'))
    const ok = await editor.reorderRoutes([5, 3])
    expect(ok).toBe(false)
    expect(reorderBusRoutes).not.toHaveBeenCalled()
  })
})

describe('儲存（整條班次 replace-all）', () => {
  it('送出的 payload 不帶 direction，且帶齊 ride_days/pinned/pickup_address_id', async () => {
    const editor = await boot([routeA({
      stops: [stop({ ride_days: MON | TUE, pinned: true, pickup_address_id: 7 })],
    })])
    vi.mocked(replaceBusRouteStops).mockResolvedValue({ data: { stops: [] } } as never)
    await editor.save()
    expect(replaceBusRouteStops).toHaveBeenCalledWith(3, [
      {
        student_id: 101, seq: 1, lat: 22.61, lng: 120.31,
        ride_days: MON | TUE, pinned: true, pickup_address_id: 7,
      },
    ])
    // 第二個參數就是 stops 陣列本身——舊契約的 (routeId, direction, stops) 已不存在
    expect(vi.mocked(replaceBusRouteStops).mock.calls[0]).toHaveLength(2)
  })

  it('清空整條班次要二次確認；使用者取消就不送出', async () => {
    const editor = await boot()
    editor.removeStop(0)
    editor.removeStop(0)
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce(new Error('cancel'))
    await editor.save()
    expect(replaceBusRouteStops).not.toHaveBeenCalled()
  })

  it('儲存失敗時保留編輯緩衝（422 不得吃掉剛排好的順序）', async () => {
    const editor = await boot()
    editor.moveStop(1, 0)
    const before = editor.stops.value.map((s) => s.student_id)
    vi.mocked(replaceBusRouteStops).mockRejectedValue(new Error('422'))
    await editor.save()
    expect(editor.stops.value.map((s) => s.student_id)).toEqual(before)
    expect(editor.dirty.value).toBe(true)
  })

  it('儲存成功但重讀失敗只給 warning，不得再喊一次「儲存失敗」（否則使用者會重送）', async () => {
    const editor = await boot()
    editor.removeStop(1)
    vi.mocked(replaceBusRouteStops).mockResolvedValue({ data: { stops: [] } } as never)
    vi.mocked(listBusRoutes).mockRejectedValueOnce(new Error('boom'))
    await editor.save()
    expect(ElMessage.success).toHaveBeenCalledWith('已儲存')
    expect(ElMessage.warning).toHaveBeenCalled()
  })
})

describe('帶入其他班次名單（copy-from 預覽）', () => {
  it('走預覽端點（preview:true，不落庫），帶入後仍是未儲存狀態', async () => {
    const editor = await boot([routeA({ stops: [] }), routeA({ id: 5, name: '早 B' })])
    vi.mocked(copyBusRouteFrom).mockResolvedValue({
      data: { preview: true, stops: [stop({ student_id: 103, student_name: '小美', seq: 1 })] },
    } as never)
    await editor.copyFromRoute(5, true)
    expect(copyBusRouteFrom).toHaveBeenCalledWith(3, {
      source_route_id: 5, reverse: true, preview: true,
    })
    expect(editor.stops.value.map((s) => s.student_id)).toEqual([103])
    expect(editor.dirty.value).toBe(true)
    expect(replaceBusRouteStops).not.toHaveBeenCalled()
  })

  it('衝突學生仍留在預覽清單並記進 copyConflicts（預覽呈現、儲存才擋）', async () => {
    const editor = await boot([routeA({ stops: [] })])
    vi.mocked(copyBusRouteFrom).mockResolvedValue({
      data: {
        preview: true,
        stops: [
          stop({ student_id: 103, student_name: '小美', seq: 1 }),
          { ...stop({ student_id: 104, student_name: '小強', seq: 2 }), conflict: true, conflict_route_name: '早 B' },
        ],
      },
    } as never)
    await editor.copyFromRoute(5)
    expect(editor.stops.value).toHaveLength(2)
    expect(editor.copyConflicts.value).toEqual([
      { student_id: 104, student_name: '小強', conflict_route_name: '早 B' },
    ])
    expect(ElMessage.warning).toHaveBeenCalled()
  })

  it('來源名單是空的就不動編輯緩衝', async () => {
    const editor = await boot()
    vi.mocked(copyBusRouteFrom).mockResolvedValue({ data: { preview: true, stops: [] } } as never)
    const ok = await editor.copyFromRoute(5)
    expect(ok).toBe(false)
    expect(editor.stops.value).toHaveLength(2)
    expect(editor.dirty.value).toBe(false)
  })
})

describe('自動排序與 ETA', () => {
  it('有未儲存變更時不得拿去預覽（端點吃的是伺服器名單，預覽出來會是別份名單）', async () => {
    const editor = await boot()
    editor.moveStop(1, 0)
    const preview = await editor.optimizePreview()
    expect(preview).toBeNull()
    expect(optimizeBusRoute).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalled()
  })

  it('預覽走 apply:false（不落庫）', async () => {
    const editor = await boot()
    vi.mocked(optimizeBusRoute).mockResolvedValue({
      data: {
        applied: false, end_time_planned: '08:05:00', moved_unpinned_student_ids: [102],
        stops: [
          { student_id: 102, seq: 1, eta_planned: '07:33:00' },
          { student_id: 101, seq: 2, eta_planned: '07:40:00' },
        ],
      },
    } as never)
    const preview = await editor.optimizePreview()
    expect(optimizeBusRoute).toHaveBeenCalledWith(3, { apply: false })
    expect(preview?.moved_unpinned_student_ids).toEqual([102])
    // 預覽本身不得動到編輯緩衝
    expect(editor.stops.value.map((s) => s.student_id)).toEqual([101, 102])
    expect(editor.dirty.value).toBe(false)
  })

  it('套用預覽只改編輯緩衝的順序與 ETA，仍需按儲存（不偷偷落庫）', async () => {
    const editor = await boot()
    editor.applyOptimize({
      applied: false,
      end_time_planned: '08:05:00',
      moved_unpinned_student_ids: [102],
      stops: [
        { student_id: 102, seq: 1, eta_planned: '07:33:00' },
        { student_id: 101, seq: 2, eta_planned: '07:40:00' },
      ],
    })
    expect(editor.stops.value.map((s) => s.student_id)).toEqual([102, 101])
    expect(editor.stops.value.map((s) => s.eta_planned)).toEqual(['07:33:00', '07:40:00'])
    expect(editor.stops.value.map((s) => s.seq)).toEqual([1, 2])
    expect(editor.dirty.value).toBe(true)
    expect(replaceBusRouteStops).not.toHaveBeenCalled()
  })

  it('預覽未涵蓋的站不會消失，排在後面並維持原相對順序', async () => {
    const editor = await boot([routeA({
      stops: [
        stop({ student_id: 101, seq: 1 }),
        stop({ student_id: 102, seq: 2 }),
        stop({ student_id: 103, seq: 3 }),
      ],
    })])
    editor.applyOptimize({
      applied: false, end_time_planned: null, moved_unpinned_student_ids: [],
      stops: [{ student_id: 103, seq: 1, eta_planned: null }],
    })
    expect(editor.stops.value.map((s) => s.student_id)).toEqual([103, 101, 102])
  })

  it('重算 ETA 會落庫，成功後重讀班次清單', async () => {
    const editor = await boot()
    vi.mocked(recomputeBusRouteEtas).mockResolvedValue({ data: {} } as never)
    const ok = await editor.recomputeEtas()
    expect(ok).toBe(true)
    expect(recomputeBusRouteEtas).toHaveBeenCalledWith(3)
    expect(listBusRoutes).toHaveBeenCalledTimes(2)
  })

  it('重算已落庫但重讀失敗只給 warning，不得喊「重算失敗」誘導重送', async () => {
    const editor = await boot()
    vi.mocked(recomputeBusRouteEtas).mockResolvedValue({ data: {} } as never)
    vi.mocked(listBusRoutes).mockRejectedValueOnce(new Error('boom'))
    await editor.recomputeEtas()
    expect(ElMessage.error).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalled()
  })
})

describe('班次建立與排序', () => {
  it('建立班次帶完整欄位；sort_order 省略時補後端同值預設 0', async () => {
    const editor = await boot([])
    vi.mocked(createBusRoute).mockResolvedValue({ data: { id: 11 } } as never)
    await editor.createRoute({
      name: '早 C', direction: 'morning', depart_time: '07:40:00', capacity: 18,
      operator_employee_ids: [5],
    })
    expect(createBusRoute).toHaveBeenCalledWith({
      name: '早 C', direction: 'morning', depart_time: '07:40:00', capacity: 18,
      operator_employee_ids: [5], sort_order: 0,
    })
  })

  it('空名稱不送出（不建立無名班次——後端沒有刪除端點）', async () => {
    const editor = await boot([])
    await editor.createRoute({
      name: '   ', direction: 'morning', depart_time: '07:40:00', capacity: 18,
    })
    expect(createBusRoute).not.toHaveBeenCalled()
    expect(ElMessage.error).toHaveBeenCalled()
  })

  it('reorder 由 index 衍生 sort_order 一次送出', async () => {
    const editor = await boot([routeA(), routeA({ id: 5, name: '早 B', sort_order: 1 })])
    vi.mocked(reorderBusRoutes).mockResolvedValue({ data: { routes: [] } } as never)
    await editor.reorderRoutes([5, 3])
    expect(reorderBusRoutes).toHaveBeenCalledWith([
      { id: 5, sort_order: 0 }, { id: 3, sort_order: 1 },
    ])
  })
})
