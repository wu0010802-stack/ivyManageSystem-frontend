/**
 * 監看頁的呈現守衛。
 *
 * 重點只有兩條，兩條都是「畫面不得說謊」：
 * - 快照失敗時**不得**顯示「今天沒有班次」（那會讓管理者以為車沒發，而其實是連線壞了）
 * - 位置不新鮮（stale / 班次已結束 / 快照失敗）時**不得**顯示地圖
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

const mocks = vi.hoisted(() => {
  const { ref: r, computed: c } = require('vue') as typeof import('vue')
  const trip = r<Record<string, unknown> | null>(null)
  const stops = r<Array<Record<string, unknown>>>([])
  const snapshotFailed = r(false)
  const stale = r(false)
  const isLive = c(() => trip.value?.status === 'in_progress')
  return {
    api: {
      routes: r<Array<Record<string, unknown>>>([]),
      selectedRouteId: r<number | null>(null),
      trip,
      stops,
      loading: r(false),
      snapshotFailed,
      stale,
      isLive,
      reconnecting: r(false),
      showMap: c(
        () => isLive.value && trip.value?.last_lat != null && !stale.value && !snapshotFailed.value,
      ),
      tripSummary: r('A 線・早上接學生'),
      init: vi.fn(),
      refresh: vi.fn(),
      selectRoute: vi.fn(),
      retryWs: vi.fn(),
      teardown: vi.fn(),
    },
  }
})

vi.mock('@/composables/useBusMonitor', async () => {
  const actual = await vi.importActual<typeof import('@/composables/useBusMonitor')>(
    '@/composables/useBusMonitor',
  )
  return { ...actual, useBusMonitor: () => mocks.api }
})

import BusMonitorView from '@/views/BusMonitorView.vue'

const s = mocks.api

// ── 可傳遞 row 的 table stubs（沿用 tests/unit/views/ActivityInquiryView.test.js 的慣例）──
const ElTableColumnStub = defineComponent({
  name: 'ElTableColumnStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h('div', {}, (props.data as unknown[]).map(
      (row, index) => h('div', { key: index }, slots.default ? slots.default({ row }) : []),
    ))
  },
})
const ElTableStub = defineComponent({
  name: 'ElTableStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h('div', { class: 'el-table' }, (slots.default?.() ?? []).map(
      (vnode, index) => h(vnode.type, { ...vnode.props, data: props.data, key: index }, vnode.children),
    ))
  },
})
const GLOBAL_STUBS = {
  'el-table': ElTableStub,
  'el-table-column': ElTableColumnStub,
  'el-tag': { template: '<span><slot /></span>' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': true,
  'el-icon': { template: '<span />' },
}
const mountView = () => mount(BusMonitorView, { global: { stubs: GLOBAL_STUBS } })

function inProgressTrip(overrides: Record<string, unknown> = {}) {
  return {
    id: 7, route_id: 3, direction: 'morning', status: 'in_progress', auto_closed: false,
    started_at: '2026-07-29T09:00:00', last_ping_at: '2026-07-29T09:00:00',
    last_lat: 22.6, last_lng: 120.3, ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  s.routes.value = [{ id: 3, name: 'A 線', is_active: true }]
  s.selectedRouteId.value = 3
  s.trip.value = null
  s.stops.value = []
  s.loading.value = false
  s.snapshotFailed.value = false
  s.stale.value = false
  s.reconnecting.value = false
})

describe('BusMonitorView', () => {
  it('進頁呼叫 init，離開呼叫 teardown（否則 WS 與計時器留在背景）', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(s.init).toHaveBeenCalledTimes(1)
    wrapper.unmount()
    expect(s.teardown).toHaveBeenCalledTimes(1)
  })

  it('快照失敗時顯示錯誤，且**不得**顯示「今天沒有班次」的空狀態', async () => {
    s.snapshotFailed.value = true
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="bus-monitor-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="bus-monitor-empty"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="bus-monitor-map"]').exists()).toBe(false)
  })

  it('沒有班次且快照正常時才顯示空狀態', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="bus-monitor-empty"]').exists()).toBe(true)
  })

  it('行駛中顯示地圖與路線方向摘要', async () => {
    s.trip.value = inProgressTrip()
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="bus-monitor-map"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="bus-monitor-summary"]').text()).toContain('A 線・早上接學生')
  })

  it('位置過時：收起地圖並說明原因', async () => {
    s.trip.value = inProgressTrip()
    s.stale.value = true
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="bus-monitor-map"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="bus-monitor-stale"]').exists()).toBe(true)
  })

  it('班次已結束：不再顯示地圖，並標示是否為逾時自動關閉', async () => {
    s.trip.value = inProgressTrip({ status: 'completed', auto_closed: true })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="bus-monitor-map"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="bus-monitor-done"]').attributes('title')).toContain('自動關閉')
  })

  it('斷線時顯示重連提示（只有兩態：正常 / 重連中）', async () => {
    s.trip.value = inProgressTrip()
    s.reconnecting.value = true
    const wrapper = mountView()
    await flushPromises()
    const conn = wrapper.find('[data-testid="bus-monitor-conn"]')
    expect(conn.exists()).toBe(true)
    expect(conn.attributes('role')).toBe('status')
    // 永遠不會觸發的 4007「權限不足」不得出現在畫面文案裡
    expect(wrapper.text()).not.toContain('權限')
  })

  it('地圖容器用 role=region + aria-label（img 會連 OSM attribution 一起隱藏）', async () => {
    s.trip.value = inProgressTrip()
    const wrapper = mountView()
    await flushPromises()
    const map = wrapper.find('[data-testid="bus-monitor-map"]')
    expect(map.attributes('role')).toBe('region')
    expect(map.attributes('aria-label')).toBe('娃娃車即時位置地圖')
  })

  it('on_leave=true 的站在站點表格顯示請假標示，讓行政知道這站沒接是預期的', async () => {
    s.trip.value = inProgressTrip()
    s.stops.value = [
      {
        stop_id: 11, student_id: 101, student_name: '小明', seq: 1,
        status: 'pending', lat: 22.61, lng: 120.31, departed_at: null, on_leave: true,
      },
    ]
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="bus-monitor-onleave-11"]').exists()).toBe(true)
  })

  it('on_leave=false 或欄位不存在時不顯示請假標示', async () => {
    s.trip.value = inProgressTrip()
    s.stops.value = [
      {
        stop_id: 11, student_id: 101, student_name: '小明', seq: 1,
        status: 'pending', lat: 22.61, lng: 120.31, departed_at: null, on_leave: false,
      },
      {
        stop_id: 12, student_id: 102, student_name: '小華', seq: 2,
        status: 'pending', lat: 22.62, lng: 120.32, departed_at: null,
      },
    ]
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="bus-monitor-onleave-11"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="bus-monitor-onleave-12"]').exists()).toBe(false)
  })
})
