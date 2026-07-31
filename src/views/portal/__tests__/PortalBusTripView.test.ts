import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const h = vi.hoisted(() => {
  const { ref: r } = require('vue') as typeof import('vue')
  return {
    api: {
      trip: r<Record<string, unknown> | null>(null),
      stops: r<Array<Record<string, unknown>>>([]),
      routes: r<Array<{ id: number; name: string }>>([]),
      selectedRouteId: r<number | null>(null),
      direction: r('morning'),
      loading: r(false),
      starting: r(false),
      completing: r(false),
      actingStopId: r<number | null>(null),
      gpsActive: r(false),
      gpsSupported: r(true),
      gpsClockSuspect: r(false),
      snapshotFailed: r(false),
      pendingPingCount: r(0),
      tripSummary: r(''),
      init: vi.fn(),
      start: vi.fn(),
      departStop: vi.fn(),
      skipStop: vi.fn(),
      undoStop: vi.fn(),
      complete: vi.fn(),
      teardown: vi.fn(),
    },
  }
})

vi.mock('@/composables/usePortalBusTrip', () => ({ usePortalBusTrip: () => h.api }))

import PortalBusTripView from '@/views/portal/PortalBusTripView.vue'

const s = h.api

function resetState() {
  s.trip.value = null
  s.stops.value = []
  s.routes.value = []
  s.selectedRouteId.value = null
  s.direction.value = 'morning'
  s.loading.value = false
  s.starting.value = false
  s.completing.value = false
  s.actingStopId.value = null
  s.gpsActive.value = false
  s.gpsSupported.value = true
  s.gpsClockSuspect.value = false
  s.snapshotFailed.value = false
  s.pendingPingCount.value = 0
  s.tripSummary.value = ''
}

function stop(overrides: Record<string, unknown> = {}) {
  return { stop_id: 11, student_id: 101, student_name: '小明', seq: 1, status: 'pending', ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
  resetState()
})

describe('PortalBusTripView', () => {
  it('進頁呼叫 init，離開頁面呼叫 teardown（停止追蹤 = 停止收集座標）', async () => {
    const wrapper = mount(PortalBusTripView)
    await flushPromises()
    expect(s.init).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    expect(s.teardown).toHaveBeenCalledTimes(1)
  })

  it('快照失敗時只顯示重試卡，絕不顯示開班卡', async () => {
    s.snapshotFailed.value = true
    s.routes.value = [{ id: 3, name: 'A 線' }]
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    expect(wrapper.find('[data-testid="bus-snapshot-failed"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="bus-start-card"]').exists()).toBe(false)
  })

  it('沒有任何啟用路線時提示洽行政', async () => {
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    expect(wrapper.find('[data-testid="bus-no-routes"]').exists()).toBe(true)
  })

  it('有路線時顯示開班卡，按下開始班次會呼叫 start', async () => {
    s.routes.value = [{ id: 3, name: 'A 線' }]
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    await wrapper.find('[data-testid="bus-start"]').trigger('click')
    expect(s.start).toHaveBeenCalledTimes(1)
  })

  it('班次進行中時渲染站點並隱藏開班卡', async () => {
    s.trip.value = { id: 7, route_id: 3, direction: 'morning', status: 'in_progress' }
    s.stops.value = [stop(), stop({ stop_id: 12, student_name: '小華', seq: 2, status: 'departed' })]
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    expect(wrapper.find('[data-testid="bus-start-card"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="bus-stop-11"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="bus-stop-12"]').text()).toContain('已離站')
  })

  it('班次進行中顯示路線與方向（接手到別條路線時的唯一可察覺訊號）', async () => {
    s.trip.value = { id: 7 }
    s.tripSummary.value = 'A 線・早上接學生'
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    expect(wrapper.find('[data-testid="bus-trip-summary"]').text()).toBe('A 線・早上接學生')
  })

  it('pending 站顯示離站/跳過，已處理站顯示撤銷', async () => {
    s.trip.value = { id: 7 }
    s.stops.value = [stop(), stop({ stop_id: 12, status: 'skipped' })]
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    const pendingBtns = wrapper.find('[data-testid="bus-stop-11"]').findAll('el-button')
    expect(pendingBtns.map((b) => b.text())).toEqual(['離站', '跳過'])
    const doneBtns = wrapper.find('[data-testid="bus-stop-12"]').findAll('el-button')
    expect(doneBtns.map((b) => b.text())).toEqual(['撤銷'])

    await pendingBtns[0].trigger('click')
    expect(s.departStop).toHaveBeenCalledWith(expect.objectContaining({ stop_id: 11 }))
    await pendingBtns[1].trigger('click')
    expect(s.skipStop).toHaveBeenCalledWith(expect.objectContaining({ stop_id: 11 }))
    await doneBtns[0].trigger('click')
    expect(s.undoStop).toHaveBeenCalledWith(expect.objectContaining({ stop_id: 12 }))
  })

  it('有站點操作進行中時鎖住其他站的按鈕（防連點送出兩筆）', async () => {
    s.trip.value = { id: 7 }
    s.stops.value = [stop(), stop({ stop_id: 12, seq: 2 })]
    s.actingStopId.value = 11
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    const otherBtns = wrapper.find('[data-testid="bus-stop-12"]').findAll('el-button')
    expect(otherBtns).toHaveLength(2)
    expect(otherBtns.map((b) => b.attributes('disabled'))).toEqual(['true', 'true'])
  })

  it('GPS 未取得位置時顯示警示；取得後消失', async () => {
    s.trip.value = { id: 7 }
    const wrapper = mount(PortalBusTripView)
    await flushPromises()
    expect(wrapper.find('[data-testid="bus-gps-warning"]').exists()).toBe(true)

    s.gpsActive.value = true
    await flushPromises()
    expect(wrapper.find('[data-testid="bus-gps-warning"]').exists()).toBe(false)
  })

  it('裝置不支援定位時給不同文案', async () => {
    s.trip.value = { id: 7 }
    s.gpsSupported.value = false
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    expect(wrapper.find('[data-testid="bus-gps-warning"]').attributes('title')).toContain('不支援定位')
  })

  it('裝置定位時間異常時顯示訊號（否則是完全無回饋的失敗模式）', async () => {
    s.trip.value = { id: 7 }
    const wrapper = mount(PortalBusTripView)
    await flushPromises()
    expect(wrapper.find('[data-testid="bus-clock-suspect"]').exists()).toBe(false)

    s.gpsClockSuspect.value = true
    await flushPromises()
    expect(wrapper.find('[data-testid="bus-clock-suspect"]').attributes('title')).toContain('定位時間異常')
  })

  it('有待重送的點時提示筆數', async () => {
    s.trip.value = { id: 7 }
    s.pendingPingCount.value = 3
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    expect(wrapper.find('[data-testid="bus-pending-pings"]').attributes('title')).toContain('3 筆')
  })

  it('結束班次按鈕呼叫 complete', async () => {
    s.trip.value = { id: 7 }
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    await wrapper.find('[data-testid="bus-complete"]').trigger('click')
    expect(s.complete).toHaveBeenCalledTimes(1)
  })

  it('畫面不得渲染站點座標（家庭住址屬個資）', async () => {
    s.trip.value = { id: 7 }
    s.stops.value = [stop({ lat: 22.6083, lng: 120.3014 })]
    const wrapper = mount(PortalBusTripView)
    await flushPromises()

    expect(wrapper.html()).not.toContain('22.6083')
    expect(wrapper.html()).not.toContain('120.3014')
  })
})

describe('PortalBusTripView — helper 自檢', () => {
  it('resetState 真的把狀態清乾淨（否則跨測試互相污染，斷言形同虛設）', () => {
    s.trip.value = { id: 99 }
    s.gpsClockSuspect.value = true
    s.pendingPingCount.value = 5
    resetState()
    expect(s.trip.value).toBeNull()
    expect(s.gpsClockSuspect.value).toBe(false)
    expect(s.pendingPingCount.value).toBe(0)
  })

  it('mock 的 composable 與 view 共用同一組 ref（改 state 會反映到畫面）', async () => {
    const wrapper = mount(PortalBusTripView)
    await flushPromises()
    expect(wrapper.find('[data-testid="bus-no-routes"]').exists()).toBe(true)

    s.trip.value = { id: 7 }
    await flushPromises()
    expect(wrapper.find('[data-testid="bus-complete"]').exists()).toBe(true)
    expect(ref(1).value).toBe(1) // vue 的 ref 有正常載入（避免 hoisted require 拿到假物件）
  })
})
