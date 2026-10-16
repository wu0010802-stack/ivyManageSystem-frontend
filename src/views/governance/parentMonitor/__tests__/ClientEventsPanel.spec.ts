/**
 * 前端事件分頁（SPEC-023 批次 3，Task 6）。
 *
 * ⚠ mock 資料形狀對齊真實 OpenAPI 產生型別（`schema.d.ts` 的
 * `ParentMonitorClientEventsOut` / `ClientEventOut`）：`by_type`／`items`／
 * `page`／`page_size`／`total` 皆可為 `null`；`ClientEventOut` 只有
 * `event_type`／`in_line_client`／`message`／`occurred_at`／`received_at`
 * 為必填，其餘（`app_build`／`error_code`／`line_version`／`os`／
 * `request_id`／`route_name`／`status_code`）皆可為 `null`。
 *
 * ⚠ `by_type` 一律涵蓋 24 小時窗內全部事件型別、不受 `type` 篩選影響
 * （後端 `queries.list_client_events` docstring）——本測試不斷言切換篩選會
 * 改變計數卡數字。
 *
 * ⚠ 三個環境限制（照 TrafficPanel.spec.ts 的做法）：
 * 1. 測試環境沒有 unplugin-vue-components，el-* 一律手動 stub。
 * 2. `[data-testid^="x-"]` 前綴選擇器會命中巢狀節點，用 class 或精確選擇器數列數。
 * 3. 本分頁沒有 ElMessageBox 寫入動作，不需要 mock element-plus。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

const h_ = vi.hoisted(() => ({
  getClientEvents: vi.fn(),
}))

vi.mock('@/api/parentMonitor', () => ({
  getParentMonitorClientEvents: h_.getClientEvents,
}))

import ClientEventsPanel from '../ClientEventsPanel.vue'

// ── el-table / el-table-column 展平慣例（沿用 TrafficPanel.spec.ts）──
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

// ⚠ el-select／el-pagination 必須 `inheritAttrs: false` 並手動只轉發
// `data-*` 屬性——若圖方便用 `v-bind="$attrs"` 轉發整包 attrs，Vue 預設的
// `inheritAttrs: true` 會把 fallthrough 的 `onChange`/`onCurrentChange` 與
// 樣板自己 `$emit(...)` 觸發的呼叫合併成陣列、同一個原生事件觸發兩次
// handler（call count 假造成 2 倍），這裡曾經因此讓「切換篩選重抓」測試
// 誤判成呼叫了兩次 API。
const ElSelectStub = defineComponent({
  name: 'ElSelectStub',
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue', 'change'],
  inheritAttrs: false,
  setup(props, { attrs, emit, slots }) {
    const dataAttrs = Object.fromEntries(Object.entries(attrs).filter(([k]) => k.startsWith('data-')))
    return () =>
      h(
        'select',
        {
          class: 'el-select',
          ...dataAttrs,
          value: props.modelValue,
          onChange: (e: Event) => {
            const val = (e.target as HTMLSelectElement).value
            emit('update:modelValue', val)
            emit('change', val)
          },
        },
        slots.default?.(),
      )
  },
})

const ElPaginationStub = defineComponent({
  name: 'ElPaginationStub',
  props: {
    total: { type: Number, default: 0 },
    pageSize: { type: Number, default: 0 },
    currentPage: { type: Number, default: 1 },
  },
  emits: ['current-change'],
  inheritAttrs: false,
  setup(_props, { attrs, emit }) {
    const dataAttrs = Object.fromEntries(Object.entries(attrs).filter(([k]) => k.startsWith('data-')))
    return () =>
      h('div', { class: 'el-pagination', ...dataAttrs }, [
        h('button', { class: 'el-pagination__page-2', onClick: () => emit('current-change', 2) }, 'page2'),
      ])
  },
})

const stubs = {
  EmptyState: {
    props: ['title', 'description'],
    template: '<div class="empty" data-testid="events-empty">{{ title }}｜{{ description }}</div>',
  },
  'el-card': { template: '<div class="el-card"><slot /></div>' },
  'el-table': ElTableStub,
  'el-table-column': ElTableColumnStub,
  'el-select': ElSelectStub,
  'el-option': { template: '<option :value="value"><slot /></option>', props: ['value', 'label'] },
  'el-pagination': ElPaginationStub,
}

function clientEvent(overrides: Partial<{
  app_build: string | null
  error_code: string | null
  event_type: string
  in_line_client: boolean
  line_version: string | null
  message: string
  occurred_at: string
  os: string | null
  received_at: string
  request_id: string | null
  route_name: string | null
  status_code: number | null
}> = {}) {
  return {
    app_build: null,
    error_code: null,
    event_type: 'login_failed',
    in_line_client: true,
    line_version: '2.24.0',
    message: 'LIFF 初始化逾時',
    occurred_at: '2026-09-04T02:00:00+00:00',
    os: 'ios',
    received_at: '2026-09-04T02:00:01+00:00',
    request_id: 'req-123',
    route_name: '/parent/home',
    status_code: null,
    ...overrides,
  }
}

describe('ClientEventsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h_.getClientEvents.mockResolvedValue({
      data: {
        enabled: true,
        by_type: { login_failed: 3, api_5xx: 1 },
        items: [clientEvent()],
        page: 1,
        page_size: 50,
        total: 1,
      },
    })
  })

  it('掛載時呼叫一次 API，by_type 計數卡數字正確', async () => {
    const w = mount(ClientEventsPanel, { global: { stubs } })
    await flushPromises()

    expect(h_.getClientEvents).toHaveBeenCalledTimes(1)
    expect(w.find('[data-testid="count-login_failed"]').text()).toContain('3')
    expect(w.find('[data-testid="count-api_5xx"]').text()).toContain('1')
  })

  it('型別一律顯示中文對照名，不顯示原始 key', async () => {
    const w = mount(ClientEventsPanel, { global: { stubs } })
    await flushPromises()

    const text = w.text()
    expect(text).toContain('登入失敗')
    expect(text).not.toContain('login_failed')
    expect(text).not.toContain('liff_init_failed')
  })

  it('切換型別篩選時帶對應 type 參數重抓、頁碼重置為 1', async () => {
    const w = mount(ClientEventsPanel, { global: { stubs } })
    await flushPromises()
    expect(h_.getClientEvents).toHaveBeenCalledTimes(1)

    await w.find('select.el-select').setValue('liff_init_failed')
    await flushPromises()

    expect(h_.getClientEvents).toHaveBeenCalledTimes(2)
    expect(h_.getClientEvents).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'liff_init_failed', page: 1 }),
    )
  })

  it('選回「全部」時不帶 type 參數', async () => {
    const w = mount(ClientEventsPanel, { global: { stubs } })
    await flushPromises()

    await w.find('select.el-select').setValue('liff_init_failed')
    await flushPromises()
    await w.find('select.el-select').setValue('')
    await flushPromises()

    const lastCall = h_.getClientEvents.mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(lastCall.type).toBeUndefined()
  })

  it('換頁時帶對應 page 參數重抓', async () => {
    const w = mount(ClientEventsPanel, { global: { stubs } })
    await flushPromises()
    expect(h_.getClientEvents).toHaveBeenCalledTimes(1)

    await w.find('.el-pagination__page-2').trigger('click')
    await flushPromises()

    expect(h_.getClientEvents).toHaveBeenCalledTimes(2)
    expect(h_.getClientEvents).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
  })

  it('無資料時顯示 EmptyState，文案說明「沒有事件是好事」而非像出錯', async () => {
    h_.getClientEvents.mockResolvedValue({
      data: { enabled: true, by_type: {}, items: [], page: 1, page_size: 50, total: 0 },
    })
    const w = mount(ClientEventsPanel, { global: { stubs } })
    await flushPromises()

    const empty = w.find('[data-testid="events-empty"]')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('沒有事件是好事')
  })

  it('enabled: false 時顯示停用態', async () => {
    h_.getClientEvents.mockResolvedValue({ data: { enabled: false } })
    const w = mount(ClientEventsPanel, { global: { stubs } })
    await flushPromises()

    expect(w.find('[data-testid="events-disabled"]').exists()).toBe(true)
    expect(w.find('[data-testid="events-table"]').exists()).toBe(false)
  })

  it('API 失敗時顯示錯誤訊息，不整頁炸掉', async () => {
    h_.getClientEvents.mockRejectedValue({
      response: { status: 500, data: { detail: '事件查詢失敗' } },
    })
    const w = mount(ClientEventsPanel, { global: { stubs } })
    await flushPromises()

    const error = w.find('[data-testid="events-error"]')
    expect(error.exists()).toBe(true)
    expect(error.text()).toContain('事件查詢失敗')
  })

  it('慢的舊回應不得蓋掉快的新回應（快速切換型別）', async () => {
    const resolvers: Array<(v: unknown) => void> = []
    const respond = (byType: Record<string, number>, message: string) => ({
      data: {
        enabled: true,
        by_type: byType,
        items: [clientEvent({ message })],
        page: 1,
        page_size: 50,
        total: 1,
      },
    })

    h_.getClientEvents.mockImplementation(
      () => new Promise((resolve) => { resolvers.push(resolve) }),
    )

    const w = mount(ClientEventsPanel, { global: { stubs } })
    await flushPromises()
    resolvers[0](respond({ login_failed: 1 }, '初始'))
    await flushPromises()

    await w.find('select.el-select').setValue('liff_init_failed')
    await flushPromises()
    await w.find('select.el-select').setValue('api_5xx')
    await flushPromises()

    expect(resolvers).toHaveLength(3)

    // 新的（api_5xx，第 3 發）先回，舊的（liff_init_failed，第 2 發）後回
    resolvers[2](respond({ api_5xx: 9 }, '最新的api_5xx'))
    await flushPromises()
    resolvers[1](respond({ liff_init_failed: 5 }, '過期的liff'))
    await flushPromises()

    const table = w.find('[data-testid="events-table"]').text()
    expect(table).toContain('最新的api_5xx')
    expect(table).not.toContain('過期的liff')
  })
})
