import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/api/index', () => ({
  default: { defaults: { baseURL: '/api' }, get: vi.fn(), post: vi.fn(), put: vi.fn() },
}))

import api from '@/api/index'
import {
  startBusTrip, getActiveBusTrip, postBusPings, departBusStop, skipBusStop,
  undoBusStop, completeBusTrip, listBusRoutes, createBusRoute,
  replaceBusRouteStops, geocodeBusStudent, getBusTripToday,
} from '../bus'

beforeEach(() => { vi.clearAllMocks() })

describe('娃娃車 portal API', () => {
  it('開始班次 POST /portal/bus/trips', () => {
    startBusTrip(3, 'afternoon')
    expect(api.post).toHaveBeenCalledWith('/portal/bus/trips', { route_id: 3, direction: 'afternoon' })
  })

  it('查進行中班次帶 route_id/direction 限縮（多路線時避免撈到別條路線的名冊）', () => {
    getActiveBusTrip(3, 'morning')
    expect(api.get).toHaveBeenCalledWith('/portal/bus/trips/active', {
      params: { route_id: 3, direction: 'morning' },
    })
  })

  it('未知路線時不送空參數（後端 route_id 有 gt=0 驗證，送 null 會 422）', () => {
    getActiveBusTrip(null, null)
    expect(api.get).toHaveBeenCalledWith('/portal/bus/trips/active', { params: {} })
    getActiveBusTrip()
    expect(api.get).toHaveBeenLastCalledWith('/portal/bus/trips/active', { params: {} })
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

  it('結束班次 POST /portal/bus/trips/{id}/complete', () => {
    completeBusTrip(7)
    expect(api.post).toHaveBeenCalledWith('/portal/bus/trips/7/complete')
  })
})

describe('娃娃車 admin API', () => {
  it('路線清單／建立', () => {
    listBusRoutes()
    expect(api.get).toHaveBeenCalledWith('/bus/routes')
    createBusRoute('A 線')
    expect(api.post).toHaveBeenCalledWith('/bus/routes', { name: 'A 線' })
  })

  it('整批換站 PUT /bus/routes/{id}/stops', () => {
    const stops = [{ student_id: 101, seq: 1, lat: 22.6, lng: 120.3 }]
    replaceBusRouteStops(3, 'morning', stops)
    expect(api.put).toHaveBeenCalledWith('/bus/routes/3/stops', { direction: 'morning', stops })
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
