/**
 * 流量分頁（SPEC-023 批次 2，Task 6）。
 *
 * ⚠ mock 資料形狀對齊真實 OpenAPI 產生型別（`schema.d.ts` 的
 * `ParentMonitorTrafficOut` / `TrafficSeriesPointOut` / `TrafficRouteOut` /
 * `TrafficSilenceOut`）：`series[].bucket_start`／`count`／`count_5xx`／
 * `p95_ms` 皆必填；`routes[]` 的 `avg_ms`／`count`／`count_5xx`／`max_ms`／
 * `method`／`p95_ms`／`rate_5xx`／`route_group`／`route_template` 皆必填；
 * `silence.baseline_per_hour`／`current_hour`／`level`／`reason`／
 * `zero_hours` 皆可為 `null`。
 *
 * ⚠ 三個環境限制（照 ProbesPanel.spec.ts 的做法）：
 * 1. 測試環境沒有 unplugin-vue-components，el-* 一律手動 stub。
 * 2. 圖表元件 canvas 在 happy-dom 下不可用，`useChartJs` 整支 mock 掉。
 * 3. `[data-testid^="x-"]` 前綴選擇器會命中巢狀節點，路由表用
 *    `flattenSlotVnodes` 展平 el-table/el-table-column 後精確比對筆數，
 *    不用前綴選擇器數列數。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, inject, provide, type InjectionKey } from 'vue'

const h_ = vi.hoisted(() => ({
  getTraffic: vi.fn(),
}))

vi.mock('@/api/parentMonitor', () => ({
  getParentMonitorTraffic: h_.getTraffic,
}))

vi.mock('@/composables/useChartJs', () => ({
  // 用可觀測的 stub 取代真正的 vue-chartjs Line 元件：把收到的 data/options
  // 序列化進 DOM，讓測試能斷言折線圖的 labels／datasets 是否正確組出，
  // 不必真的畫 canvas（happy-dom 不支援）。
  LineChart: defineComponent({
    name: 'LineChartStub',
    props: ['data', 'options'],
    setup(props) {
      return () =>
        h('div', {
          class: 'stub-line-chart',
          'data-testid': 'traffic-chart',
          'data-labels': JSON.stringify((props.data as { labels: unknown[] })?.labels ?? []),
          'data-datasets': JSON.stringify(
            ((props.data as { datasets: { label: string; data: unknown[] }[] })?.datasets ?? []).map(
              (d) => ({ label: d.label, data: d.data }),
            ),
          ),
        })
    },
  }),
}))

import TrafficPanel from '../TrafficPanel.vue'

// ── el-table / el-table-column 展平慣例（沿用 PenaltyCatalogPanel.spec.ts）──
function flattenSlotVnodes(
  vnodes: unknown[],
): { type: unknown; props: Record<string, unknown>; children: unknown }[] {
  const out: { type: unknown; props: Record<string, unknown>; children: unknown }[] = []
  for (const v of (vnodes || []) as { type: unknown; children: unknown; props?: Record<string, unknown> }[]) {
    if (v && typeof v.type === 'symbol' && Array.isArray(v.children)) {
      out.push(...flattenSlotVnodes(v.children as unknown[]))
    } else if (v) {
      out.push({ type: v.type, props: v.props ?? {}, children: v.children })
    }
  }
  return out
}

const ElTableStub = defineComponent({
  name: 'ElTableStub',
  props: { data: { type: Array, default: () => [] } },
  inheritAttrs: false,
  setup(props, { slots, attrs }) {
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
    )
    return () => {
      const flat = flattenSlotVnodes((slots.default?.() || []) as unknown[])
      return h(
        'table',
        { class: 'el-table', ...dataAttrs },
        flat.map((vnode, index) =>
          h(vnode.type as never, { ...vnode.props, data: props.data, key: index }, vnode.children as never),
        ),
      )
    }
  },
})

const ElTableColumnStub = defineComponent({
  name: 'ElTableColumnStub',
  props: {
    data: { type: Array, default: () => [] },
    prop: { type: String, default: null },
    label: { type: String, default: '' },
  },
  setup(props, { slots }) {
    return () =>
      h(
        'tr',
        { class: 'el-table-column', 'data-label': props.label },
        (props.data as Record<string, unknown>[]).map((row, index) => {
          const content = slots.default
            ? slots.default({ row, $index: index })
            : [String(props.prop ? row[props.prop] : '')]
          return h('td', { key: index, class: 'el-table-cell' }, content as never)
        }),
      )
  },
})

// el-radio-group / el-radio-button 用 provide/inject 模擬 model 傳遞（沿用
// PenaltyCatalogPanel.spec.ts 慣例），避免依賴不可靠的 DOM change 事件冒泡。
const RADIO_GROUP_KEY = Symbol('radio-group-stub') as InjectionKey<{
  select: (val: string) => void
}>

const ElRadioGroupStub = defineComponent({
  name: 'ElRadioGroupStub',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  inheritAttrs: false,
  setup(_props, { attrs, emit, slots }) {
    provide(RADIO_GROUP_KEY, { select: (val: string) => emit('update:modelValue', val) })
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
    )
    return () => h('div', dataAttrs, slots.default?.())
  },
})

const ElRadioButtonStub = defineComponent({
  name: 'ElRadioButtonStub',
  props: ['value'],
  inheritAttrs: false,
  setup(props, { slots }) {
    const group = inject(RADIO_GROUP_KEY, null)
    return () =>
      h(
        'button',
        { 'data-value': props.value as string, onClick: () => group?.select(props.value as string) },
        slots.default?.(),
      )
  },
})

const stubs = {
  EmptyState: { props: ['title', 'description'], template: '<div class="empty">{{ title }}｜{{ description }}</div>' },
  'el-radio-group': ElRadioGroupStub,
  'el-radio-button': ElRadioButtonStub,
  'el-table': ElTableStub,
  'el-table-column': ElTableColumnStub,
  'el-tag': { props: ['type'], template: '<span :data-type="type"><slot /></span>' },
}

function seriesPoint(overrides: Partial<{
  bucket_start: string
  count: number
  count_5xx: number
  p95_ms: number
}> = {}) {
  return {
    bucket_start: '2026-09-04T02:00:00+00:00',
    count: 10,
    count_5xx: 1,
    p95_ms: 300,
    ...overrides,
  }
}

function routeRow(overrides: Partial<{
  avg_ms: number
  count: number
  count_5xx: number
  max_ms: number
  method: string
  p95_ms: number
  rate_5xx: number
  route_group: string
  route_template: string
}> = {}) {
  return {
    avg_ms: 120,
    count: 100,
    count_5xx: 5,
    max_ms: 5000,
    method: 'GET',
    p95_ms: 300,
    rate_5xx: 0.05,
    route_group: 'auth',
    route_template: '/parent/auth/login',
    ...overrides,
  }
}

function silenceOf(overrides: Partial<{
  baseline_per_hour: number | null
  current_hour: number | null
  level: 'green' | 'yellow' | 'red' | 'gray' | null
  reason: string | null
  zero_hours: number | null
}> = {}) {
  return {
    baseline_per_hour: 42.5,
    current_hour: 38,
    level: 'green' as const,
    reason: '流量正常',
    zero_hours: 0,
    ...overrides,
  }
}

describe('TrafficPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h_.getTraffic.mockResolvedValue({
      data: {
        enabled: true,
        range: '24h',
        granularity_minutes: 5,
        series: [seriesPoint()],
        routes: [routeRow()],
        silence: silenceOf(),
      },
    })
  })

  it('掛載時以預設 24h 呼叫一次 API，並畫出折線圖與路由表', async () => {
    const w = mount(TrafficPanel, { global: { stubs } })
    await flushPromises()

    expect(h_.getTraffic).toHaveBeenCalledTimes(1)
    expect(h_.getTraffic).toHaveBeenCalledWith({ range: '24h' })

    const chart = w.find('[data-testid="traffic-chart"]')
    expect(chart.exists()).toBe(true)
    const datasets = JSON.parse(chart.attributes('data-datasets') as string) as { label: string; data: number[] }[]
    expect(datasets.find((d) => d.label === '總請求')?.data).toEqual([10])
    expect(datasets.find((d) => d.label === '5xx 錯誤')?.data).toEqual([1])

    const table = w.find('[data-testid="traffic-routes"]')
    expect(table.exists()).toBe(true)
    const rows = table.findAll('td.el-table-cell')
    // 7 欄 × 1 列
    expect(rows.length).toBe(7)
    expect(table.text()).toContain('/parent/auth/login')
    expect(table.text()).toContain('GET')
    expect(table.text()).toContain('5.0%') // rate_5xx 0.05 → 5.0%
  })

  it('切換區間為 7 天時用新的 range 重新呼叫 API', async () => {
    const w = mount(TrafficPanel, { global: { stubs } })
    await flushPromises()
    expect(h_.getTraffic).toHaveBeenCalledTimes(1)

    h_.getTraffic.mockResolvedValue({
      data: {
        enabled: true,
        range: '7d',
        granularity_minutes: 60,
        series: [seriesPoint({ bucket_start: '2026-09-01T02:00:00+00:00' })],
        routes: [routeRow()],
        silence: silenceOf(),
      },
    })

    await w.find('[data-value="7d"]').trigger('click')
    await flushPromises()

    expect(h_.getTraffic).toHaveBeenCalledTimes(2)
    expect(h_.getTraffic).toHaveBeenLastCalledWith({ range: '7d' })
  })

  it('7 天視窗（60 分鐘桶）的折線圖標籤含月/日，24 小時視窗（5 分鐘桶）只含時:分', async () => {
    h_.getTraffic.mockResolvedValue({
      data: {
        enabled: true,
        range: '7d',
        granularity_minutes: 60,
        series: [seriesPoint({ bucket_start: '2026-09-01T02:00:00+00:00' })],
        routes: [],
        silence: silenceOf(),
      },
    })
    const w = mount(TrafficPanel, { global: { stubs } })
    await flushPromises()

    const chart = w.find('[data-testid="traffic-chart"]')
    const labels = JSON.parse(chart.attributes('data-labels') as string) as string[]
    expect(labels[0]).toMatch(/^\d{2}\/\d{2} \d{2}:\d{2}$/)
  })

  it('series 為空時顯示 EmptyState，文案說明剛部署還沒資料，不是只寫「無資料」', async () => {
    h_.getTraffic.mockResolvedValue({
      data: { enabled: true, range: '24h', granularity_minutes: 5, series: [], routes: [], silence: silenceOf() },
    })
    const w = mount(TrafficPanel, { global: { stubs } })
    await flushPromises()

    const empty = w.find('[data-testid="traffic-empty"]')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('剛部署')
    expect(empty.text()).not.toBe('無資料')
  })

  it('silence.baseline_per_hour 為 null 時顯示「未收集」而非 0', async () => {
    h_.getTraffic.mockResolvedValue({
      data: {
        enabled: true,
        range: '24h',
        granularity_minutes: 5,
        series: [seriesPoint()],
        routes: [routeRow()],
        silence: silenceOf({ baseline_per_hour: null, level: 'gray', reason: '尚未收集到基線' }),
      },
    })
    const w = mount(TrafficPanel, { global: { stubs } })
    await flushPromises()

    const detail = w.find('[data-testid="traffic-silence-detail"]')
    expect(detail.text()).toContain('未收集')
    expect(detail.text()).not.toContain('0 次/小時')
  })

  it('enabled: false 時顯示停用態，不再渲染圖表或路由表', async () => {
    h_.getTraffic.mockResolvedValue({ data: { enabled: false } })
    const w = mount(TrafficPanel, { global: { stubs } })
    await flushPromises()

    expect(h_.getTraffic).toHaveBeenCalledTimes(1)
    expect(w.find('[data-testid="traffic-disabled"]').exists()).toBe(true)
    expect(w.find('[data-testid="traffic-chart"]').exists()).toBe(false)
    expect(w.find('[data-testid="traffic-routes"]').exists()).toBe(false)
  })

  it('API 失敗時顯示錯誤訊息，不整頁炸掉', async () => {
    h_.getTraffic.mockRejectedValue({
      response: { status: 500, data: { detail: '流量查詢失敗' } },
    })
    const w = mount(TrafficPanel, { global: { stubs } })
    await flushPromises()

    const error = w.find('[data-testid="traffic-error"]')
    expect(error.exists()).toBe(true)
    expect(error.text()).toContain('流量查詢失敗')
  })
})
