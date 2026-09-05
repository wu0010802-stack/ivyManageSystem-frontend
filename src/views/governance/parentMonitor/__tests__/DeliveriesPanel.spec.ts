/**
 * 推播投遞分頁（SPEC-023 批次 3，Task 6）。
 *
 * ⚠ mock 資料形狀對齊真實 OpenAPI 產生型別（`schema.d.ts` 的
 * `ParentMonitorDeliveriesOut` / `DeliveryByEventTypeOut` / `DeliveryFailedOut`
 * / `DeliveryFailureReasonOut` / `DeliveryRetryOut`）：
 * - `DeliveryByEventTypeOut` 只有 `attempted`／`event_type`／`final_failed`
 *   三個必填欄位——**沒有** `succeeded`／`retrying`（後端
 *   `queries.collect_delivery_detail` 只彙總這兩個數字），失敗率由前端用
 *   `final_failed / attempted` 算，不可假裝有 `succeeded`/`retrying` 欄位。
 * - `DeliveryFailedOut`：`created_at` 可為 `null`，其餘皆必填。
 * - `unfollowed_count` 可為 `null`。
 *
 * ⚠ 三個環境限制（照 TrafficPanel.spec.ts 的做法）：
 * 1. 測試環境沒有 unplugin-vue-components，el-* 一律手動 stub。
 * 2. `[data-testid^="x-"]` 前綴選擇器會命中巢狀節點，用精確選擇器數列數。
 * 3. `ElMessageBox` 要 mock（重送鈕有確認框）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

const h_ = vi.hoisted(() => ({
  getDeliveries: vi.fn(),
  retryDelivery: vi.fn(),
}))

vi.mock('@/api/parentMonitor', () => ({
  getParentMonitorDeliveries: h_.getDeliveries,
  retryParentMonitorDelivery: h_.retryDelivery,
}))

const mockHasPermission = vi.fn()
vi.mock('@/utils/auth', () => ({
  hasPermission: (name: string) => mockHasPermission(name),
}))

const mockConfirm = vi.fn()
const mockMessageSuccess = vi.fn()
const mockMessageError = vi.fn()
vi.mock('element-plus', () => ({
  ElMessage: { success: (...a: unknown[]) => mockMessageSuccess(...a), error: (...a: unknown[]) => mockMessageError(...a) },
  ElMessageBox: { confirm: (...a: unknown[]) => mockConfirm(...a) },
}))

import DeliveriesPanel from '../DeliveriesPanel.vue'

// ── el-table / el-table-column 展平慣例（沿用 TrafficPanel.spec.ts，支援 scoped slot）──
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

// ⚠ `inheritAttrs: false` ＋只手動轉發 `data-*`：若用 `v-bind="$attrs"`
// 轉發整包 attrs，Vue 預設 `inheritAttrs: true` 的 fallthrough `onClick` 會
// 跟樣板自己 `emit('click')` 觸發的呼叫合併成陣列，同一次點擊觸發兩次
// handler（重送 API／確認框都會被呼叫兩次）。
const ElButtonStub = defineComponent({
  name: 'ElButtonStub',
  props: { loading: { type: Boolean, default: false } },
  emits: ['click'],
  inheritAttrs: false,
  setup(props, { attrs, emit, slots }) {
    const dataAttrs = Object.fromEntries(Object.entries(attrs).filter(([k]) => k.startsWith('data-')))
    return () =>
      h(
        'button',
        { ...dataAttrs, disabled: props.loading, onClick: () => emit('click') },
        slots.default?.(),
      )
  },
})

const stubs = {
  EmptyState: {
    props: ['title', 'description'],
    template: '<div class="empty" data-testid="deliveries-empty">{{ title }}｜{{ description }}</div>',
  },
  'el-card': { template: '<div class="el-card"><slot /></div>' },
  'el-table': ElTableStub,
  'el-table-column': ElTableColumnStub,
  'el-button': ElButtonStub,
}

function byEventType(overrides: Partial<{ attempted: number; event_type: string; final_failed: number }> = {}) {
  return { attempted: 10, event_type: 'bus_pickup', final_failed: 2, ...overrides }
}

function failedItem(overrides: Partial<{
  created_at: string | null
  event_type: string
  id: number
  line_retry_count: number
  recipient_user_id: number
  title: string
}> = {}) {
  return {
    created_at: '2026-09-04T01:00:00+00:00',
    event_type: 'bus_pickup',
    id: 42,
    line_retry_count: 3,
    recipient_user_id: 7,
    title: '娃娃車接送通知',
    ...overrides,
  }
}

function mockDeliveries(overrides: Partial<{
  by_event_type: ReturnType<typeof byEventType>[]
  failed: ReturnType<typeof failedItem>[]
  failure_reasons: { count: number; reason: string }[]
  unfollowed_count: number | null
}> = {}) {
  return {
    data: {
      enabled: true,
      by_event_type: [byEventType()],
      failed: [failedItem()],
      failure_reasons: [{ count: 4, reason: 'LINE API 逾時' }],
      unfollowed_count: 3,
      ...overrides,
    },
  }
}

describe('DeliveriesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHasPermission.mockReturnValue(false)
    h_.getDeliveries.mockResolvedValue(mockDeliveries())
  })

  it('顯示已封鎖家長數卡片', async () => {
    const w = mount(DeliveriesPanel, { global: { stubs } })
    await flushPromises()

    expect(h_.getDeliveries).toHaveBeenCalledTimes(1)
    expect(w.find('[data-testid="unfollowed-count-value"]').text()).toContain('3')
    expect(w.text()).toContain('封鎖官方帳號後推播就送不到')
  })

  it('無 SETTINGS_WRITE 權限時不渲染重送鈕', async () => {
    mockHasPermission.mockReturnValue(false)
    const w = mount(DeliveriesPanel, { global: { stubs } })
    await flushPromises()

    expect(w.find('[data-testid="retry-btn-42"]').exists()).toBe(false)
  })

  it('有 SETTINGS_WRITE 權限時渲染重送鈕，點擊會跳確認框', async () => {
    mockHasPermission.mockImplementation((name: string) => name === 'SETTINGS_WRITE')
    mockConfirm.mockRejectedValue('cancel')
    const w = mount(DeliveriesPanel, { global: { stubs } })
    await flushPromises()

    const btn = w.find('[data-testid="retry-btn-42"]')
    expect(btn.exists()).toBe(true)

    await btn.trigger('click')
    await flushPromises()

    expect(mockConfirm).toHaveBeenCalledTimes(1)
    expect(h_.retryDelivery).not.toHaveBeenCalled()
  })

  it('確認後呼叫重送 API，成功後重抓列表（不做本地樂觀更新）', async () => {
    mockHasPermission.mockImplementation((name: string) => name === 'SETTINGS_WRITE')
    mockConfirm.mockResolvedValue(true)
    h_.retryDelivery.mockResolvedValue({ data: { id: 42, line_retry_count: 0, line_next_retry_at: '2026-09-04T02:00:00+00:00' } })

    const w = mount(DeliveriesPanel, { global: { stubs } })
    await flushPromises()
    expect(h_.getDeliveries).toHaveBeenCalledTimes(1)

    // 重送後改回傳空清單，驗證畫面真的重抓而非只改本地狀態
    h_.getDeliveries.mockResolvedValue(mockDeliveries({ failed: [] }))

    await w.find('[data-testid="retry-btn-42"]').trigger('click')
    await flushPromises()

    expect(h_.retryDelivery).toHaveBeenCalledWith(42)
    expect(h_.getDeliveries).toHaveBeenCalledTimes(2)
    expect(mockMessageSuccess).toHaveBeenCalled()
    expect(w.find('[data-testid="retry-btn-42"]').exists()).toBe(false)
  })

  it('409（尚未達最終失敗門檻）顯示後端提供的可讀中文訊息', async () => {
    mockHasPermission.mockImplementation((name: string) => name === 'SETTINGS_WRITE')
    mockConfirm.mockResolvedValue(true)
    h_.retryDelivery.mockRejectedValue({
      response: { status: 409, data: { detail: '尚未達最終失敗門檻(line_retry_count < 3),不接受手動重送' } },
    })

    const w = mount(DeliveriesPanel, { global: { stubs } })
    await flushPromises()
    await w.find('[data-testid="retry-btn-42"]').trigger('click')
    await flushPromises()

    expect(mockMessageError).toHaveBeenCalledWith(expect.stringContaining('尚未達最終失敗門檻'))
    // 失敗不應該重抓（重送本身沒有成功，列表狀態不變）
    expect(h_.getDeliveries).toHaveBeenCalledTimes(1)
  })

  it('404（找不到或屬於別租戶／總開關關閉）顯示後端提供的可讀中文訊息', async () => {
    mockHasPermission.mockImplementation((name: string) => name === 'SETTINGS_WRITE')
    mockConfirm.mockResolvedValue(true)
    h_.retryDelivery.mockRejectedValue({
      response: { status: 404, data: { detail: '找不到指定的推播紀錄' } },
    })

    const w = mount(DeliveriesPanel, { global: { stubs } })
    await flushPromises()
    await w.find('[data-testid="retry-btn-42"]').trigger('click')
    await flushPromises()

    expect(mockMessageError).toHaveBeenCalledWith(expect.stringContaining('找不到指定的推播紀錄'))
  })

  it('by_event_type 表只讀 attempted／final_failed，失敗率由前端計算', async () => {
    const w = mount(DeliveriesPanel, { global: { stubs } })
    await flushPromises()

    const table = w.find('[data-testid="by-event-type-table"]')
    expect(table.text()).toContain('bus_pickup')
    expect(table.text()).toContain('10')
    expect(table.text()).toContain('2')
    expect(table.text()).toContain('20.0%')
  })

  it('失敗原因 top N 表格顯示', async () => {
    const w = mount(DeliveriesPanel, { global: { stubs } })
    await flushPromises()

    const table = w.find('[data-testid="failure-reasons-table"]')
    expect(table.text()).toContain('LINE API 逾時')
    expect(table.text()).toContain('4')
  })

  it('by_event_type／failed 皆為空時顯示 EmptyState，但已封鎖家長數卡片仍顯示（獨立於時間窗）', async () => {
    h_.getDeliveries.mockResolvedValue(
      mockDeliveries({ by_event_type: [], failed: [], failure_reasons: [], unfollowed_count: 2 }),
    )
    const w = mount(DeliveriesPanel, { global: { stubs } })
    await flushPromises()

    expect(w.find('[data-testid="deliveries-empty"]').exists()).toBe(true)
    expect(w.find('[data-testid="unfollowed-count-value"]').text()).toContain('2')
  })

  it('enabled: false 時顯示停用態', async () => {
    h_.getDeliveries.mockResolvedValue({ data: { enabled: false } })
    const w = mount(DeliveriesPanel, { global: { stubs } })
    await flushPromises()

    expect(w.find('[data-testid="deliveries-disabled"]').exists()).toBe(true)
  })

  it('API 失敗時顯示錯誤訊息，不整頁炸掉', async () => {
    h_.getDeliveries.mockRejectedValue({
      response: { status: 500, data: { detail: '推播投遞查詢失敗' } },
    })
    const w = mount(DeliveriesPanel, { global: { stubs } })
    await flushPromises()

    const error = w.find('[data-testid="deliveries-error"]')
    expect(error.exists()).toBe(true)
    expect(error.text()).toContain('推播投遞查詢失敗')
  })
})
