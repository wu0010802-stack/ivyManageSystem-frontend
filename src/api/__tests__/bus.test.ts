import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/api/index', () => ({
  default: {
    defaults: { baseURL: '/api' },
    get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn(),
  },
}))

import api from '@/api/index'
import {
  startBusTrip, getActiveBusTrip, postBusPings, departBusStop, skipBusStop,
  undoBusStop, completeBusTrip, listPortalBusRoutes, listBusRoutes, createBusRoute,
  replaceBusRouteStops, geocodeBusStudent, getBusTripToday, updateBusRoute,
  reorderBusRoutes, copyBusRouteFrom, optimizeBusRoute, recomputeBusRouteEtas,
  listStudentPickupAddresses, createStudentPickupAddress, deleteStudentPickupAddress,
  getBusDailyPlan, patchBusDailyPlanStops, optimizeBusDailyPlan, resetBusDailyPlan,
  getBusSettings, putBusSettings, listBusTrips,
} from '../bus'

beforeEach(() => { vi.clearAllMocks() })

describe('娃娃車 portal API', () => {
  it('開始班次 POST /portal/bus/trips —— 契約破壞：body 不再帶 direction（方向由班次衍生）', () => {
    startBusTrip(3)
    expect(api.post).toHaveBeenCalledWith('/portal/bus/trips', { route_id: 3 })
    expect(api.post).not.toHaveBeenCalledWith(
      '/portal/bus/trips',
      expect.objectContaining({ direction: expect.anything() }),
    )
  })

  it('查進行中班次帶 route_id/direction 限縮（多班次時避免撈到別條班次的名冊）', () => {
    getActiveBusTrip(3, 'morning')
    expect(api.get).toHaveBeenCalledWith('/portal/bus/trips/active', {
      params: { route_id: 3, direction: 'morning' },
    })
  })

  it('未知班次時不送空參數（後端 route_id 有 gt=0 驗證，送 null 會 422）', () => {
    getActiveBusTrip(null, null)
    expect(api.get).toHaveBeenCalledWith('/portal/bus/trips/active', { params: {} })
    getActiveBusTrip()
    expect(api.get).toHaveBeenLastCalledWith('/portal/bus/trips/active', { params: {} })
  })

  it('mine=true 只在明確要求時帶（預設不帶：後端預設 false，帶了才收斂成「我的班次」）', () => {
    getActiveBusTrip(null, null, true)
    expect(api.get).toHaveBeenCalledWith('/portal/bus/trips/active', { params: { mine: true } })
    getActiveBusTrip(3)
    expect(api.get).toHaveBeenLastCalledWith('/portal/bus/trips/active', {
      params: { route_id: 3 },
    })
  })

  it('上報座標 POST /portal/bus/trips/{id}/pings，body 為 {points}', () => {
    const points = [{ lat: 22.6, lng: 120.3, accuracy: 12, at: '2026-07-29T01:00:00.000Z' }]
    postBusPings(7, points)
    expect(api.post).toHaveBeenCalledWith('/portal/bus/trips/7/pings', { points })
  })

  it('站點三動作各自打對路徑', () => {
    departBusStop(7, 11)
    expect(api.post).toHaveBeenLastCalledWith('/portal/bus/trips/7/stops/11/depart')
    skipBusStop(7, 11)
    expect(api.post).toHaveBeenLastCalledWith('/portal/bus/trips/7/stops/11/skip')
    undoBusStop(7, 11)
    expect(api.post).toHaveBeenLastCalledWith('/portal/bus/trips/7/stops/11/undo')
  })

  it('開班選單走 portal 端點（BUS_TRIPS_OPERATE，不含站點名冊）', () => {
    listPortalBusRoutes()
    expect(api.get).toHaveBeenCalledWith('/portal/bus/routes')
  })

  it('結束班次 POST /portal/bus/trips/{id}/complete', () => {
    completeBusTrip(7)
    expect(api.post).toHaveBeenCalledWith('/portal/bus/trips/7/complete')
  })
})

describe('娃娃車 admin API —— 班次設定', () => {
  it('班次清單走 admin 端點（回應已塌平，呼叫端不再讀 stops.morning）', () => {
    listBusRoutes()
    expect(api.get).toHaveBeenCalledWith('/bus/routes')
  })

  it('建立班次帶完整欄位（名稱/方向/出發時間/容量/隨車老師），不是只帶 name', () => {
    createBusRoute({
      name: 'A 線', direction: 'morning', depart_time: '07:30:00',
      capacity: 20, sort_order: 1, operator_employee_ids: [5],
    })
    expect(api.post).toHaveBeenCalledWith('/bus/routes', {
      name: 'A 線', direction: 'morning', depart_time: '07:30:00',
      capacity: 20, sort_order: 1, operator_employee_ids: [5],
    })
  })

  it('部分更新班次 PATCH /bus/routes/{id}，只帶有變動的欄位（方向唯讀，不在 payload）', () => {
    updateBusRoute(3, { name: 'A 線新名' })
    expect(api.patch).toHaveBeenLastCalledWith('/bus/routes/3', { name: 'A 線新名' })
    updateBusRoute(3, { capacity: 18, operator_employee_ids: [5, 9] })
    expect(api.patch).toHaveBeenLastCalledWith('/bus/routes/3', {
      capacity: 18, operator_employee_ids: [5, 9],
    })
    updateBusRoute(3, { is_active: false })
    expect(api.patch).toHaveBeenLastCalledWith('/bus/routes/3', { is_active: false })
  })

  it('班次排序 PATCH /bus/routes/reorder，body 為裸陣列（非 {items}）', () => {
    reorderBusRoutes([{ id: 3, sort_order: 0 }, { id: 5, sort_order: 1 }])
    expect(api.patch).toHaveBeenCalledWith('/bus/routes/reorder', [
      { id: 3, sort_order: 0 }, { id: 5, sort_order: 1 },
    ])
  })

  it('整批換站 PUT /bus/routes/{id}/stops —— 契約破壞：body 不再帶 direction，範圍是整條班次', () => {
    const stops = [{ student_id: 101, seq: 1, ride_days: 31, pinned: false, pickup_address_id: null }]
    replaceBusRouteStops(3, stops)
    expect(api.put).toHaveBeenCalledWith('/bus/routes/3/stops', { stops })
    expect(api.put).not.toHaveBeenCalledWith(
      '/bus/routes/3/stops',
      expect.objectContaining({ direction: expect.anything() }),
    )
  })

  it('帶入其他班次名單 POST /bus/routes/{id}/copy-from，預覽與儲存共用同一支', () => {
    copyBusRouteFrom(5, { source_route_id: 3, reverse: true, preview: true })
    expect(api.post).toHaveBeenLastCalledWith('/bus/routes/5/copy-from', {
      source_route_id: 3, reverse: true, preview: true,
    })
    copyBusRouteFrom(5, { source_route_id: 3, reverse: true, preview: false })
    expect(api.post).toHaveBeenLastCalledWith('/bus/routes/5/copy-from', {
      source_route_id: 3, reverse: true, preview: false,
    })
  })

  it('自動排序預設是預覽不落庫（apply=false），要落庫必須顯式 apply=true', () => {
    optimizeBusRoute(3)
    expect(api.post).toHaveBeenLastCalledWith('/bus/routes/3/optimize', { apply: false })
    optimizeBusRoute(3, { apply: true })
    expect(api.post).toHaveBeenLastCalledWith('/bus/routes/3/optimize', { apply: true })
  })

  it('順序固定重算 ETA POST /bus/routes/{id}/recompute-etas', () => {
    recomputeBusRouteEtas(3)
    expect(api.post).toHaveBeenCalledWith('/bus/routes/3/recompute-etas')
  })

  it('地理編碼與今日班次', () => {
    geocodeBusStudent(101)
    expect(api.post).toHaveBeenCalledWith('/bus/routes/geocode', { student_id: 101 })
    getBusTripToday(3)
    expect(api.get).toHaveBeenLastCalledWith('/bus/trips/today', { params: { route_id: 3 } })
    getBusTripToday()
    expect(api.get).toHaveBeenLastCalledWith('/bus/trips/today', { params: {} })
  })
})

describe('娃娃車 admin API —— 學生接送地址簿', () => {
  it('三支端點各自打對路徑（皆掛在 /bus/students/{id} 下）', () => {
    listStudentPickupAddresses(101)
    expect(api.get).toHaveBeenCalledWith('/bus/students/101/pickup-addresses')
    createStudentPickupAddress(101, { label: '阿嬤家', address: '高雄市…' })
    expect(api.post).toHaveBeenCalledWith('/bus/students/101/pickup-addresses', {
      label: '阿嬤家', address: '高雄市…',
    })
    deleteStudentPickupAddress(101, 7)
    expect(api.delete).toHaveBeenCalledWith('/bus/students/101/pickup-addresses/7')
  })
})

describe('娃娃車 admin API —— 當日調度', () => {
  it('當日計畫 GET /bus/daily-plans，date 省略時交給後端預設今天（不自行算日期）', () => {
    getBusDailyPlan()
    expect(api.get).toHaveBeenLastCalledWith('/bus/daily-plans', { params: {} })
    getBusDailyPlan({ date: '2026-08-27', route_id: 3 })
    expect(api.get).toHaveBeenLastCalledWith('/bus/daily-plans', {
      params: { date: '2026-08-27', route_id: 3 },
    })
  })

  it('當日名單編輯 PATCH …/stops，單一 body 表達增刪改與重排', () => {
    const payload = {
      inserts: [{ student_id: 101, pickup_address_id: null }],
      removes: [102],
      excuse: [103],
      unexcuse: [104],
      address_changes: [{ student_id: 105, pickup_address_id: 7 }],
      reorder: [101, 103, 105],
    }
    patchBusDailyPlanStops(9, payload)
    expect(api.patch).toHaveBeenCalledWith('/bus/daily-plans/9/stops', payload)
  })

  it('當日計畫自動排序同樣預設預覽不落庫；重設無 body', () => {
    optimizeBusDailyPlan(9)
    expect(api.post).toHaveBeenLastCalledWith('/bus/daily-plans/9/optimize', { apply: false })
    optimizeBusDailyPlan(9, { apply: true })
    expect(api.post).toHaveBeenLastCalledWith('/bus/daily-plans/9/optimize', { apply: true })
    resetBusDailyPlan(9)
    expect(api.post).toHaveBeenLastCalledWith('/bus/daily-plans/9/reset')
  })
})

describe('娃娃車 admin API —— 設定與歷史', () => {
  it('設定讀寫走 GET/PUT /bus/settings；部分更新只帶要改的欄位', () => {
    getBusSettings()
    expect(api.get).toHaveBeenCalledWith('/bus/settings')
    putBusSettings({ bus_count: 2 })
    expect(api.put).toHaveBeenLastCalledWith('/bus/settings', { bus_count: 2 })
    putBusSettings({ school_address: '高雄市…', geocode: true })
    expect(api.put).toHaveBeenLastCalledWith('/bus/settings', {
      school_address: '高雄市…', geocode: true,
    })
  })

  it('顯式帶 null 是「清除設定」，不可被前端當成未帶而濾掉', () => {
    putBusSettings({ school_lat: null, school_lng: null })
    expect(api.put).toHaveBeenLastCalledWith('/bus/settings', {
      school_lat: null, school_lng: null,
    })
  })

  it('歷史清單預設排除 planned/expired；要含它們必須顯式 include_planned', () => {
    listBusTrips({ page: 1, page_size: 20 })
    expect(api.get).toHaveBeenLastCalledWith('/bus/trips', {
      params: { page: 1, page_size: 20 },
    })
    listBusTrips({ include_planned: true })
    expect(api.get).toHaveBeenLastCalledWith('/bus/trips', {
      params: { include_planned: true },
    })
  })
})
