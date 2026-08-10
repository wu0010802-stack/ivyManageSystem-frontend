/**
 * 娃娃車乘車歷史（管理端，`/bus-history`，`BUS_READ`）。
 *
 * 家長申訴「昨天接晚了」時園方要查得到歷史，本頁是唯一入口。重點：
 * - 篩選（路線／方向／日期區間）與分頁要打對後端 query 參數
 * - 逐站明細要看得到，但 **lat/lng（家庭座標）絕不能印在畫面上**（隱私鐵律）
 * - auto_closed（司機忘了按結束、系統自動關閉）要有明顯標示，那是園方該注意的訊號
 * - 三態（載入中／空／錯誤）要各自可辨識
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'

const mockIsMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({
  useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }),
}))

const listBusTrips = vi.fn()
const getBusTrip = vi.fn()
const listBusRoutes = vi.fn()
vi.mock('@/api/bus', () => ({
  listBusTrips: (...args: unknown[]) => listBusTrips(...args),
  getBusTrip: (...args: unknown[]) => getBusTrip(...args),
  listBusRoutes: (...args: unknown[]) => listBusRoutes(...args),
}))

import BusHistoryView from '@/views/BusHistoryView.vue'

// ── 可傳遞 row 的 table stubs（沿用 BusMonitorView.test.ts 的慣例）──
const ElTableColumnStub = defineComponent({
  name: 'ElTableColumnStub',
  props: { data: { type: Array, default: () => [] }, prop: { type: String, default: '' } },
  setup(props, { slots }) {
    return () => h('div', {}, (props.data as Record<string, unknown>[]).map(
      (row, index) => h(
        'div',
        { key: index, class: 'row' },
        slots.default
          ? slots.default({ row })
          : (props.prop ? String(row[props.prop] ?? '') : ''),
      ),
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
  'el-tag': { template: '<span class="el-tag"><slot /></span>' },
  'el-icon': { template: '<span />' },
  'el-select': {
    template:
      '<select class="el-select" v-bind="$attrs" ' +
      '@change="$emit(\'update:modelValue\', $event.target.value); $emit(\'change\', $event.target.value)">' +
      '<slot /></select>',
  },
  'el-option': { template: '<option :value="value"><slot /></option>', props: ['value', 'label'] },
  'el-date-picker': {
    template: '<input class="el-date-picker" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue'],
  },
  'el-pagination': {
    template:
      '<div class="el-pagination">' +
      '<button class="el-pagination__next-page" @click="$emit(\'current-change\', currentPage + 1)">next</button>' +
      '<button class="el-pagination__size-50" @click="$emit(\'size-change\', 50)">size50</button>' +
      '</div>',
    props: ['total', 'pageSize', 'currentPage'],
  },
  'el-drawer': { template: '<div class="el-drawer" v-if="modelValue"><slot /></div>', props: ['modelValue'] },
  'el-empty': { template: '<div class="el-empty"><slot />{{ description }}</div>', props: ['description'] },
  'el-alert': { template: '<div class="el-alert" :title="title"><slot /></div>', props: ['title', 'description'] },
  'el-skeleton': { template: '<div class="el-skeleton" />' },
}

function mountView() {
  return mount(BusHistoryView, { global: { stubs: GLOBAL_STUBS } })
}

function fakeTrip(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    route_id: 1,
    route_name: '主線',
    direction: 'morning',
    trip_date: '2026-08-09',
    status: 'completed',
    auto_closed: false,
    started_at: '2026-08-09T07:00:00',
    completed_at: '2026-08-09T07:40:00',
    operator_employee_id: 5,
    operator_employee_name: '隨車老師',
    stop_stats: { total: 2, departed: 1, skipped: 1, pending: 0 },
    ...overrides,
  }
}

const FAKE_LAT = 22.123456
const FAKE_LNG = 120.654321

function fakeTripDetail(overrides: Record<string, unknown> = {}) {
  return {
    ...fakeTrip(),
    stops: [
      {
        stop_id: 10, student_id: 100, student_name: '王小明', seq: 1,
        lat: FAKE_LAT, lng: FAKE_LNG, status: 'departed', departed_at: '2026-08-09T07:10:00',
      },
      {
        stop_id: 11, student_id: 101, student_name: '陳小華', seq: 2,
        lat: 22.2, lng: 120.7, status: 'skipped', departed_at: null,
      },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockIsMobile.value = false
  listBusRoutes.mockResolvedValue({ data: [{ id: 1, name: '主線', is_active: true }] })
  listBusTrips.mockResolvedValue({ data: { items: [fakeTrip()], total: 1, page: 1, page_size: 20 } })
  getBusTrip.mockResolvedValue({ data: fakeTripDetail() })
})

describe('BusHistoryView 清單', () => {
  it('進頁載入並渲染班次基本欄位', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(listBusTrips).toHaveBeenCalled()
    expect(wrapper.text()).toContain('主線')
    expect(wrapper.text()).toContain('隨車老師')
  })

  it('載入中顯示 loading 態', async () => {
    let resolveFn: (v: unknown) => void = () => {}
    listBusTrips.mockReturnValue(new Promise((resolve) => { resolveFn = resolve }))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="bus-history-loading"]').exists()).toBe(true)
    resolveFn({ data: { items: [], total: 0, page: 1, page_size: 20 } })
    await flushPromises()
  })

  it('空狀態：查無資料時顯示空狀態，不誤判為載入中或錯誤', async () => {
    listBusTrips.mockResolvedValue({ data: { items: [], total: 0, page: 1, page_size: 20 } })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="bus-history-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="bus-history-loading"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="bus-history-error"]').exists()).toBe(false)
  })

  it('錯誤狀態：查詢失敗時顯示錯誤，不誤判為空清單', async () => {
    listBusTrips.mockRejectedValue(new Error('boom'))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="bus-history-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="bus-history-empty"]').exists()).toBe(false)
  })

  it('auto_closed 班次要有明顯標示（司機忘了按結束，系統自動關閉）', async () => {
    listBusTrips.mockResolvedValue({
      data: { items: [fakeTrip({ auto_closed: true })], total: 1, page: 1, page_size: 20 },
    })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="bus-history-autoclosed"]').exists()).toBe(true)
  })

  it('查詢條件觸發正確的查詢參數（路線／方向／日期區間），並重置回第 1 頁', async () => {
    const wrapper = mountView()
    await flushPromises()
    listBusTrips.mockClear()

    await wrapper.find('[data-testid="bus-history-filter-route"]').setValue('1')
    await wrapper.find('[data-testid="bus-history-filter-direction"]').setValue('afternoon')
    await wrapper.find('[data-testid="bus-history-filter-date-from"]').setValue('2026-08-01')
    await wrapper.find('[data-testid="bus-history-filter-date-to"]').setValue('2026-08-09')
    await wrapper.find('[data-testid="bus-history-search"]').trigger('click')
    await flushPromises()

    expect(listBusTrips).toHaveBeenCalledWith(
      expect.objectContaining({
        route_id: 1,
        direction: 'afternoon',
        date_from: '2026-08-01',
        date_to: '2026-08-09',
        page: 1,
      }),
    )
  })

  it('分頁變更觸發正確的 page / page_size', async () => {
    listBusTrips.mockResolvedValue({
      data: { items: [fakeTrip()], total: 45, page: 1, page_size: 20 },
    })
    const wrapper = mountView()
    await flushPromises()
    listBusTrips.mockClear()

    await wrapper.find('.el-pagination__next-page').trigger('click')
    await flushPromises()
    expect(listBusTrips).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }))

    listBusTrips.mockClear()
    await wrapper.find('.el-pagination__size-50').trigger('click')
    await flushPromises()
    expect(listBusTrips).toHaveBeenCalledWith(expect.objectContaining({ page_size: 50, page: 1 }))
  })
})

describe('BusHistoryView 詳情', () => {
  it('點擊查看明細開啟抽屜並顯示逐站資料（站序／學生姓名／狀態／離站時間）', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('[data-testid="bus-history-detail-btn"]').trigger('click')
    await flushPromises()

    expect(getBusTrip).toHaveBeenCalledWith(1)
    const drawer = wrapper.find('[data-testid="bus-history-drawer"]')
    expect(drawer.exists()).toBe(true)
    expect(drawer.text()).toContain('王小明')
    expect(drawer.text()).toContain('已離站')
    expect(drawer.text()).toContain('陳小華')
    expect(drawer.text()).toContain('已跳過')
  })

  it('⚠ 隱私鐵律：詳情畫面不得出現座標數字（lat/lng＝家庭住址）', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('[data-testid="bus-history-detail-btn"]').trigger('click')
    await flushPromises()

    const html = wrapper.html()
    expect(html).not.toContain(String(FAKE_LAT))
    expect(html).not.toContain(String(FAKE_LNG))
    expect(html).not.toContain('22.2')
    expect(html).not.toContain('120.7')
  })
})

describe('BusHistoryView 手機卡片切換', () => {
  it('桌機顯示 el-table、手機顯示 AdminListCards', async () => {
    mockIsMobile.value = false
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('.el-table').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'AdminListCards' }).exists()).toBe(false)

    mockIsMobile.value = true
    await flushPromises()
    expect(wrapper.findComponent({ name: 'AdminListCards' }).exists()).toBe(true)
  })
})
