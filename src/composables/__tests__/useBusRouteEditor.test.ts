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
  /**
   * 2026-08-27 起釘選一律手動：調整順序**不動釘選旗標**。舊行為（被拖動的站
   * 自動釘選）會讓站數一多就整批變釘選，而全站釘選使自動排序變成 no-op。
   */
  it('拖拉落點重排不動釘選旗標（釘選一律手動）', async () => {
    const editor = await boot([routeA({
      stops: [
        stop({ student_id: 101, seq: 1 }),
        stop({ student_id: 102, seq: 2 }),
        stop({ student_id: 103, seq: 3, pinned: true }),
      ],
    })])
    editor.moveStop(2, 0)
    expect(editor.stops.value.map((s) => s.student_id)).toEqual([103, 101, 102])
    // 原本就釘選的站保持釘選、其餘不因為被移動而變釘選
    expect(editor.stops.value.map((s) => s.pinned)).toEqual([true, false, false])
    expect(editor.stops.value.map((s) => s.seq)).toEqual([1, 2, 3])
    expect(editor.dirty.value).toBe(true)
  })

  it('往後拖：splice 語意必須與 sortable 的 newIndex（移動後索引）一致', async () => {
    // 這條若搞反，送出的 seq 順序會錯，而後端只檢查「集合相等／seq 不重複」
    // 不檢查順序意圖——不會 422，會靜默寫入錯誤的接送順序。
    const editor = await boot([routeA({
      stops: [
        stop({ student_id: 101, seq: 1 }),
        stop({ student_id: 102, seq: 2 }),
        stop({ student_id: 103, seq: 3 }),
      ],
    })])
    editor.moveStop(0, 2)
    expect(editor.stops.value.map((s) => s.student_id)).toEqual([102, 103, 101])
    expect(editor.stops.value.every((s) => !s.pinned)).toBe(true)
    expect(editor.stops.value.map((s) => s.seq)).toEqual([1, 2, 3])
  })

  it('往後拖的順序會原樣進到 replace-all payload（後端不驗順序，錯了不會被擋）', async () => {
    const editor = await boot([routeA({
      stops: [
        stop({ student_id: 101, seq: 1 }),
        stop({ student_id: 102, seq: 2 }),
        stop({ student_id: 103, seq: 3 }),
      ],
    })])
    editor.moveStop(0, 2)
    vi.mocked(replaceBusRouteStops).mockResolvedValue({ data: { stops: [] } } as never)
    await editor.save()
    const sent = vi.mocked(replaceBusRouteStops).mock.calls[0][1] as Array<{ student_id: number; seq: number }>
    expect(sent.map((s) => [s.student_id, s.seq])).toEqual([[102, 1], [103, 2], [101, 3]])
  })

  it('釘選可一鍵解除', async () => {
    const editor = await boot([routeA({ stops: [stop({ pinned: true })] })])
    editor.togglePinned(0)
    expect(editor.stops.value[0].pinned).toBe(false)
  })

  /**
   * 全站釘選時自動排序必然 no-op（後端分段最佳化每段 0 個自由站），unpinAll 是
   * 預覽 Dialog 給的出口，免得使用者逐站點 📌。
   */
  it('unpinAll 解除全部釘選並標記未儲存，回傳是否真的有站被解除', async () => {
    const editor = await boot([routeA({
      stops: [
        stop({ student_id: 101, pinned: true }),
        stop({ student_id: 102, pinned: true }),
      ],
    })])
    expect(editor.unpinAll()).toBe(true)
    expect(editor.stops.value.every((s) => !s.pinned)).toBe(true)
    expect(editor.dirty.value).toBe(true)
    // 已經沒有釘選站時回 false，view 才能改講「目前沒有釘選的站點」
    expect(editor.unpinAll()).toBe(false)
  })

  it('unpinAll 不動順序，只改釘選旗標', async () => {
    const editor = await boot([routeA({
      stops: [
        stop({ student_id: 101, pinned: true }),
        stop({ student_id: 102, pinned: false }),
        stop({ student_id: 103, pinned: true }),
      ],
    })])
    const seqBefore = editor.stops.value.map((s) => s.seq)
    editor.unpinAll()
    expect(editor.stops.value.map((s) => s.student_id)).toEqual([101, 102, 103])
    expect(editor.stops.value.map((s) => s.seq)).toEqual(seqBefore)
  })

  it('setPickupAddress 的 id=null 是「住家」，且會一併帶入座標與地址文字、清掉過期旗標', async () => {
    const editor = await boot([routeA({ stops: [stop({ address_stale: true, pickup_address_id: 7 })] })])
    editor.setPickupAddress(0, { id: null, lat: 22.7, lng: 120.4, address: '住家地址' })
    expect(editor.stops.value[0]).toMatchObject({
      pickup_address_id: null, lat: 22.7, lng: 120.4,
      address_snapshot: '住家地址', address_stale: false,
    })
  })

  it('重選同一筆地址時不得把既有座標清成 null（住家虛擬項後端永遠不帶座標）', async () => {
    const editor = await boot([routeA({ stops: [stop({ pickup_address_id: null, lat: 22.61, lng: 120.31 })] })])
    editor.setPickupAddress(0, { id: null, lat: null, lng: null, address: null })
    expect(editor.stops.value[0]).toMatchObject({
      pickup_address_id: null, lat: 22.61, lng: 120.31,
      address_snapshot: '高雄市三民區某路 1 號',
    })
  })

  it('真的換成另一筆地址而該地址沒座標時，座標才歸零（不能沿用別的地址的座標）', async () => {
    const editor = await boot([routeA({ stops: [stop({ pickup_address_id: null, lat: 22.61, lng: 120.31 })] })])
    editor.setPickupAddress(0, { id: 7, lat: null, lng: null, address: '阿嬤家' })
    expect(editor.stops.value[0]).toMatchObject({
      pickup_address_id: 7, lat: null, lng: null, address_snapshot: '阿嬤家',
    })
  })

  it('重選同一筆非住家地址簿地址時，不得用地址簿原始座標覆蓋掉已手動微調過的座標', async () => {
    const editor = await boot([routeA({ stops: [stop({ pickup_address_id: 7, lat: 24.0, lng: 121.0 })] })])
    // 地址簿裡這筆地址的原始 geocode 座標（22.61/120.31）跟站點目前已微調過的座標（24.0/121.0）不同；
    // 重選同一筆（id 沒變）不該把已微調的座標退回原始 geocode 值。
    editor.setPickupAddress(0, { id: 7, lat: 22.61, lng: 120.31, address: '阿嬤家' })
    expect(editor.stops.value[0]).toMatchObject({
      pickup_address_id: 7, lat: 24.0, lng: 121.0, address_snapshot: '阿嬤家',
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

  it('422 的後端 detail 必須原樣呈現，不得吞成通用文案', async () => {
    // 後端這兩則 422 都直接告訴使用者「去哪裡改」——跨班次衝突指出衝突班次名稱、
    // capacity 超載指出是哪幾個星期。吞成「儲存失敗，請確認名單後再試」等於
    // 把唯一可行動的資訊丟掉。
    const editor = await boot()
    editor.togglePinned(0)
    vi.mocked(replaceBusRouteStops).mockRejectedValue({
      response: { status: 422, data: { detail: '下列學生的搭車星期與其他班次的同方向名單衝突：學生 103（早 B）' } },
    })
    await editor.save()
    expect(ElMessage.error).toHaveBeenCalledWith(
      '下列學生的搭車星期與其他班次的同方向名單衝突：學生 103（早 B）',
    )
  })

  it('capacity 超載的 422 同樣要指出是哪幾個星期', async () => {
    const editor = await boot()
    editor.togglePinned(0)
    vi.mocked(replaceBusRouteStops).mockRejectedValue({
      response: { status: 422, data: { detail: '下列星期搭車人數超過座位上限：週一（21／20）' } },
    })
    await editor.save()
    expect(ElMessage.error).toHaveBeenCalledWith('下列星期搭車人數超過座位上限：週一（21／20）')
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

  it('reorder 已落庫但重讀失敗只給 warning，不得喊「調整順序失敗」誘導再拖一次', async () => {
    const editor = await boot([routeA(), routeA({ id: 5, name: '早 B', sort_order: 1 })])
    vi.mocked(reorderBusRoutes).mockResolvedValue({ data: { routes: [] } } as never)
    vi.mocked(listBusRoutes).mockRejectedValueOnce(new Error('boom'))
    const ok = await editor.reorderRoutes([5, 3])
    expect(ok).toBe(true)
    expect(ElMessage.error).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalled()
  })

  it('儲存後若原本有 ETA 要提醒需重算（後端 replace_stops 不寫 eta_planned）', async () => {
    const editor = await boot([routeA({ stops: [stop({ eta_planned: '07:35:00' })] })])
    editor.togglePinned(0)
    vi.mocked(replaceBusRouteStops).mockResolvedValue({ data: { stops: [] } } as never)
    await editor.save()
    expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('重算預計抵達'))
  })

  it('原本就沒有 ETA 時不要多嘴提醒重算', async () => {
    const editor = await boot([routeA({ stops: [stop({ eta_planned: null })] })])
    editor.togglePinned(0)
    vi.mocked(replaceBusRouteStops).mockResolvedValue({ data: { stops: [] } } as never)
    await editor.save()
    expect(vi.mocked(ElMessage.warning).mock.calls.flat().join(''))
      .not.toContain('重算預計抵達')
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

// ── 隱私守衛（自舊版原樣搬回，流程換成本期新 API）──
describe('隱私', () => {
  it('全流程不得把座標、地址、電話或名冊寫進 console 或任何 storage', async () => {
    vi.mocked(replaceBusRouteStops).mockResolvedValue({ data: { stops: [] } } as never)
    vi.mocked(copyBusRouteFrom).mockResolvedValue({
      data: { preview: true, stops: [stop({ student_id: 103, student_name: '小美', seq: 1 })] },
    } as never)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // ⚠ 兩個恆綠陷阱：tests/setup.js 的 localStorage 是純物件 mock（Storage.prototype
    // 的 spy 抓不到），happy-dom 的 sessionStorage 是 Proxy（instance spy 的賦值被吞）。
    // 故 localStorage 對實際物件下 spy、sessionStorage 整個換掉；自檢見本 describe 末。
    const storageSpy = vi.spyOn(localStorage, 'setItem')
    const sessionSpy = vi.fn()
    const originalSession = globalThis.sessionStorage
    vi.stubGlobal('sessionStorage', { setItem: sessionSpy, getItem: () => null, removeItem: vi.fn(), clear: vi.fn() })
    // 本期新增的外洩面：address_snapshot、contacts[].phone、pickup 座標
    const editor = await boot([routeA({
      stops: [stop({ contacts: [{ name: '媽媽', phone: '0912345678' }] })],
    })])
    editor.addStop(103)
    editor.setPickupAddress(0, { id: 7, lat: 22.7, lng: 120.4, address: '高雄市左營區某街 2 號' })
    editor.moveStop(1, 0)
    await editor.copyFromRoute(5)
    await editor.save()
    expect(logSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
    expect(storageSpy).not.toHaveBeenCalled()
    expect(sessionSpy).not.toHaveBeenCalled()
    logSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
    storageSpy.mockRestore()
    vi.stubGlobal('sessionStorage', originalSession)
  })

  it('守衛自檢：storage spy 真的抓得到寫入', () => {
    const storageSpy = vi.spyOn(localStorage, 'setItem')
    const sessionSpy = vi.fn()
    const originalSession = globalThis.sessionStorage
    vi.stubGlobal('sessionStorage', { setItem: sessionSpy, getItem: () => null, removeItem: vi.fn(), clear: vi.fn() })
    localStorage.setItem('probe', '1')
    sessionStorage.setItem('probe', '1')
    expect(storageSpy).toHaveBeenCalled()
    expect(sessionSpy).toHaveBeenCalled()
    storageSpy.mockRestore()
    vi.stubGlobal('sessionStorage', originalSession)
  })

  it('守衛自檢：console spy 真的抓得到輸出', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    console.log('probe')
    expect(logSpy).toHaveBeenCalled()
    logSpy.mockRestore()
  })
})

// ── 測試輔助函式自檢 ──
describe('測試輔助函式自檢', () => {
  it('studentsPayload 真的帶著家長 PII（否則「只留 id/name」的斷言形同虛設）', () => {
    const payload = studentsPayload([{ id: 1, name: 'x' }])
    expect(payload.data.items[0]).toMatchObject({ parent_phone: '0912345678' })
  })

  it('routeA 的名冊第一站真的帶座標、第二站真的沒有', () => {
    const r = routeA()
    expect(r.stops[0]).toMatchObject({ lat: 22.61, lng: 120.31 })
    expect(r.stops[1]).toMatchObject({ lat: null, lng: null })
  })
})

// ── 未儲存來源可擴充（表單欄位也要納入同一條防線）──
describe('registerExtraDirty', () => {
  it('外部來源回報 dirty 時，切換班次同樣要先確認', async () => {
    const editor = await boot([routeA(), routeA({ id: 5, name: '早 B', stops: [] })])
    let formDirty = false
    editor.registerExtraDirty(() => formDirty)
    // 名單本身沒動，只有表單有未儲存變更
    expect(editor.dirty.value).toBe(false)
    formDirty = true
    expect(editor.anyDirty.value).toBe(true)
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce(new Error('cancel'))
    expect(await editor.selectRoute(5)).toBe(false)
    expect(editor.activeRouteId.value).toBe(3)
  })

  it('建立班次也走同一條防線（內部會重讀而蓋掉名單緩衝）', async () => {
    const editor = await boot()
    editor.addStop(103)
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce(new Error('cancel'))
    const id = await editor.createRoute({
      name: '早 C', direction: 'morning', depart_time: '07:40:00', capacity: 18,
    })
    expect(id).toBeNull()
    expect(createBusRoute).not.toHaveBeenCalled()
  })

  it('站點被刪光（length 0 但 dirty）時，帶入名單仍要先確認', async () => {
    const editor = await boot()
    editor.removeStop(0)
    editor.removeStop(0)
    expect(editor.stops.value).toHaveLength(0)
    expect(editor.dirty.value).toBe(true)
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce(new Error('cancel'))
    expect(await editor.copyFromRoute(5)).toBe(false)
    expect(copyBusRouteFrom).not.toHaveBeenCalled()
  })

  it('**只有**表單 dirty 時，改班次設定不彈確認——表單變更就是這次要送出的 payload，不是要捨棄的東西', async () => {
    // 若這裡看 anyDirty，「儲存班次設定」按下去（表單必然有變更）每次都會彈出
    // 「捨棄變更」對話框，且按「留在這裡」反而取消儲存——語意顛倒。
    const editor = await boot()
    editor.registerExtraDirty(() => true)
    expect(editor.dirty.value).toBe(false)
    expect(editor.anyDirty.value).toBe(true)
    vi.mocked(updateBusRoute).mockResolvedValue({ data: {} } as never)
    const ok = await editor.updateRoute(3, { capacity: 18 })
    expect(ok).toBe(true)
    expect(ElMessageBox.confirm).not.toHaveBeenCalled()
    expect(updateBusRoute).toHaveBeenCalledWith(3, { capacity: 18 })
  })

  it('只有表單 dirty 時，reorder 也不彈確認（表單只在換班次時重置，同 id 重讀動不到它）', async () => {
    const editor = await boot([routeA(), routeA({ id: 5, name: '早 B', stops: [] })])
    editor.registerExtraDirty(() => true)
    vi.mocked(reorderBusRoutes).mockResolvedValue(routesPayload([]) as never)
    const ok = await editor.reorderRoutes([5, 3])
    expect(ok).toBe(true)
    expect(ElMessageBox.confirm).not.toHaveBeenCalled()
    expect(reorderBusRoutes).toHaveBeenCalled()
  })
})
