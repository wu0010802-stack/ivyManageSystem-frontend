import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, defineComponent, h } from 'vue'
import AppraisalPayoutView from '../AppraisalPayoutView.vue'

vi.mock('@/api/yearEnd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/yearEnd')>()
  return {
    ...actual,
    previewAppraisalPayout: vi.fn(),
    generateAppraisalPayout: vi.fn(),
    listAppraisalPayouts: vi.fn(),
    voidAppraisalPayouts: vi.fn(),
  }
})

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn().mockResolvedValue('confirm') },
  }
})

// Task 13③：year 同步 URL query，需要可觀察的 route.query / router.replace
// （比照 CycleListView.spec.ts 慣例：routeQuery 為可變殼、replaceMock 供斷言）。
const routeQuery: { value: Record<string, unknown> } = { value: {} }
const replaceMock = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: routeQuery.value }),
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), back: vi.fn() }),
}))

import * as api from '@/api/yearEnd'
import { ElMessage, ElMessageBox } from 'element-plus'

const mockPreviewRow = (overrides: Record<string, unknown> = {}) => ({
  employee_id: 1, employee_name: '王主任', role_group: 'DIRECTOR',
  earlier_summary_id: 10, earlier_amount: '6400', earlier_cycle_finalized: true,
  later_summary_id: 20, later_amount: '7200', later_cycle_finalized: true,
  total_amount: '13600', is_inactive: false, warnings: [],
  ...overrides,
})

const mockPayoutItem = (overrides: Record<string, unknown> = {}) => ({
  id: 1, employee_id: 1, employee_name: '王主任', bonus_type: 'appraisal_year_end',
  period_label: '113上', amount: '12345', source_ref: 'settlement:10', calc_meta: {},
  ...overrides,
})

// el-table / el-table-column 需要真的執行 scoped #default slot 才能驗證表格內容
// （比照 YearEndDetailView.spec.ts 慣例）；其餘元件用全域 auto-stub 即可。
const ElTableColumnStub = defineComponent({
  name: 'ElTableColumnStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h(
      'div',
      { class: 'el-table-column-stub' },
      props.data.map((row: unknown, index: number) =>
        h('div', { key: index }, slots.default ? slots.default({ row }) : []),
      ),
    )
  },
})

const ElTableStub = defineComponent({
  name: 'ElTableStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h(
      'div',
      { class: 'el-table' },
      (slots.default?.() || []).map((vnode, index) =>
        h(vnode.type, { ...vnode.props, data: props.data, key: index }, vnode.children),
      ),
    )
  },
})

const ElButtonStub = defineComponent({
  name: 'ElButtonStub',
  inheritAttrs: false,
  setup(_, { attrs, emit, slots }) {
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-') || k === 'loading'),
    )
    return () => h(
      'button',
      { ...dataAttrs, onClick: () => emit('click') },
      slots.default?.(),
    )
  },
})

const ElTabsStub = defineComponent({
  name: 'ElTabsStub',
  setup(_, { slots }) {
    return () => h('div', { class: 'el-tabs-stub' }, slots.default?.())
  },
})
const ElTabPaneStub = defineComponent({
  name: 'ElTabPaneStub',
  props: { name: { type: String, default: '' } },
  setup(props, { slots }) {
    return () => h('div', { class: 'el-tab-pane-stub', 'data-name': props.name }, slots.default?.())
  },
})

async function mountView() {
  const wrapper = mount(AppraisalPayoutView, {
    global: {
      stubs: {
        'el-input-number': true, 'el-button': ElButtonStub, 'el-alert': true,
        'el-tabs': ElTabsStub, 'el-tab-pane': ElTabPaneStub, 'el-table': ElTableStub,
        'el-table-column': ElTableColumnStub, 'el-tag': true, 'el-checkbox': true,
      },
      directives: { loading: () => {} },
    },
  })
  await nextTick()
  await nextTick()
  return wrapper
}

describe('AppraisalPayoutView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeQuery.value = {}
  })

  it('loads preview rows on mount', async () => {
    vi.mocked(api.previewAppraisalPayout).mockResolvedValue({
      data: [mockPreviewRow(), mockPreviewRow({ employee_id: 2, employee_name: '林老師' })],
    } as never)
    await mountView()
    expect(api.previewAppraisalPayout).toHaveBeenCalled()
  })

  it('exposes inactive opt-in default off', async () => {
    vi.mocked(api.previewAppraisalPayout).mockResolvedValue({
      data: [
        mockPreviewRow({ employee_id: 1 }),
        mockPreviewRow({ employee_id: 3, employee_name: '陳老師', is_inactive: true }),
      ],
    } as never)
    const wrapper = await mountView()
    // ACTIVE 預設勾、INACTIVE 預設不勾
    const vm = wrapper.vm as unknown as { selected: Set<number> }
    expect(vm.selected.has(1)).toBe(true)
    expect(vm.selected.has(3)).toBe(false)
  })

  it('calls generate with included_inactive ids when user opts in', async () => {
    vi.mocked(api.previewAppraisalPayout).mockResolvedValue({
      data: [
        mockPreviewRow({ employee_id: 1 }),
        mockPreviewRow({ employee_id: 3, is_inactive: true }),
      ],
    } as never)
    vi.mocked(api.generateAppraisalPayout).mockResolvedValue({
      data: { cycle_id: 1, generated_count: 4, affected_employee_count: 2, total_amount: '27200', skipped_inactive_count: 0, warnings: [] },
    } as never)
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { selected: Set<number>; onGenerate: () => Promise<void> }
    vm.selected.add(3)  // user opts in
    await vm.onGenerate()
    expect(api.generateAppraisalPayout).toHaveBeenCalledWith({
      year: expect.any(Number),
      included_inactive_employee_ids: [3],
    })
  })

  it('exposes warning state when any cycle not finalized', async () => {
    vi.mocked(api.previewAppraisalPayout).mockResolvedValue({
      data: [mockPreviewRow({ earlier_cycle_finalized: false })],
    } as never)
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { anyCycleNotFinalized: boolean }
    expect(vm.anyCycleNotFinalized).toBe(true)
  })

  // bug #27：後端 generate 一律發放全部在職員工，忽略前端對在職列的取消勾選。
  // 前端必須誠實化：在職列不可排除，confirm 筆數/合計涵蓋全部在職 + 已勾選非在職。
  it('在職列無法被排除：toggleSelect 對在職員工為 no-op', async () => {
    vi.mocked(api.previewAppraisalPayout).mockResolvedValue({
      data: [mockPreviewRow({ employee_id: 1, is_inactive: false })],
    } as never)
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      selected: Set<number>
      toggleSelect: (id: number, checked: boolean) => void
    }
    expect(vm.selected.has(1)).toBe(true)
    // 嘗試取消勾選在職員工
    vm.toggleSelect(1, false)
    // 仍維持勾選（後端會發放，前端不可顯示為已排除）
    expect(vm.selected.has(1)).toBe(true)
  })

  it('payoutRows 涵蓋全部在職 + 已勾選非在職（即使在職列被嘗試取消）', async () => {
    vi.mocked(api.previewAppraisalPayout).mockResolvedValue({
      data: [
        mockPreviewRow({ employee_id: 1, total_amount: '13600', is_inactive: false }),
        mockPreviewRow({ employee_id: 2, total_amount: '10000', is_inactive: false }),
        mockPreviewRow({ employee_id: 3, total_amount: '5000', is_inactive: true }),
      ],
    } as never)
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      selected: Set<number>
      toggleSelect: (id: number, checked: boolean) => void
      payoutRows: { employee_id: number }[]
      payoutTotal: number
    }
    // 嘗試排除一位在職員工（應無效）
    vm.toggleSelect(1, false)
    await nextTick()
    const ids = vm.payoutRows.map((r) => r.employee_id).sort()
    expect(ids).toEqual([1, 2])
    expect(vm.payoutTotal).toBe(23600)
    // 勾選一位非在職員工後納入
    vm.toggleSelect(3, true)
    await nextTick()
    const ids2 = vm.payoutRows.map((r) => r.employee_id).sort()
    expect(ids2).toEqual([1, 2, 3])
    expect(vm.payoutTotal).toBe(28600)
  })

  it('generate confirm 後送出 included_inactive_employee_ids = 已勾選非在職（在職不傳）', async () => {
    vi.mocked(api.previewAppraisalPayout).mockResolvedValue({
      data: [
        mockPreviewRow({ employee_id: 1, is_inactive: false }),
        mockPreviewRow({ employee_id: 3, is_inactive: true }),
      ],
    } as never)
    vi.mocked(api.generateAppraisalPayout).mockResolvedValue({
      data: { cycle_id: 1, generated_count: 4, affected_employee_count: 2, total_amount: '27200', skipped_inactive_count: 0, warnings: [] },
    } as never)
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      toggleSelect: (id: number, checked: boolean) => void
      onGenerate: () => Promise<void>
    }
    vm.toggleSelect(3, true)  // opt-in 非在職
    await vm.onGenerate()
    expect(api.generateAppraisalPayout).toHaveBeenCalledWith({
      year: expect.any(Number),
      included_inactive_employee_ids: [3],
    })
  })

  // Task 13①：已生成分頁改接 listAppraisalPayouts 真列表（切到該分頁時載入）。
  it('已生成分頁渲染 listAppraisalPayouts 真列表（員工姓名/期別/金額）', async () => {
    vi.mocked(api.previewAppraisalPayout).mockResolvedValue({ data: [] } as never)
    vi.mocked(api.listAppraisalPayouts).mockResolvedValue({
      data: [
        mockPayoutItem({ id: 1, employee_id: 1, employee_name: '王主任', period_label: '113上', amount: '12345', source_ref: 'settlement:10' }),
        mockPayoutItem({ id: 2, employee_id: 2, employee_name: '林老師', period_label: '113下', amount: '6000', source_ref: null }),
      ],
    } as never)
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { tab: 'preview' | 'generated' }
    vm.tab = 'generated'
    await nextTick()
    await nextTick()

    expect(api.listAppraisalPayouts).toHaveBeenCalledWith(expect.any(Number))
    const text = wrapper.text()
    expect(text).toContain('王主任')
    expect(text).toContain('113上')
    expect(text).toContain('NT$12,345') // 金額千分位
    expect(text).toContain('林老師')
    expect(text).toContain('NT$6,000')
    expect(text).toContain('—') // source_ref null → em dash
  })

  // Task 13②：預覽分頁 footer 大按鈕金額改 formatCurrency（修無千分位）。
  it('金額以 formatCurrency 千分位呈現', async () => {
    vi.mocked(api.previewAppraisalPayout).mockResolvedValue({
      data: [mockPreviewRow({ employee_id: 1, total_amount: '12345', is_inactive: false })],
    } as never)
    const wrapper = await mountView()
    const button = wrapper.find('[data-test="generate-button"]')
    expect(button.exists()).toBe(true)
    expect(button.text()).toContain('NT$12,345')
  })

  // Task 13③：year 持久化進 URL query（F5 / 分享連結可保留篩選狀態）。
  it('year 同步 URL query：改年份 → route.query.year 更新', async () => {
    vi.mocked(api.previewAppraisalPayout).mockResolvedValue({ data: [] } as never)
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { year: number }
    vm.year = 2027
    await nextTick()
    expect(replaceMock).toHaveBeenCalledWith({ query: expect.objectContaining({ year: '2027' }) })
  })

  // ── 批次 A②（2026-08-12）：發放頁收據式改版 ─────────────────────────────
  // 「生成」原本成功只彈一個 toast，使用者不知道建立了什麼、下一步去哪。改為：
  // ① confirm 文案明示「只建立發放資料，不會執行匯款」② 成功後顯示收據卡
  //（人數/筆數/總額/離職納入與略過數/轉帳名冊下載連結）③ 英文技術詞中文化。

  it('confirm 文案明示不會執行匯款', async () => {
    vi.mocked(api.previewAppraisalPayout).mockResolvedValue({
      data: [mockPreviewRow()],
    } as never)
    vi.mocked(api.generateAppraisalPayout).mockResolvedValue({
      data: { cycle_id: 1, generated_count: 2, affected_employee_count: 1, total_amount: '13600', skipped_inactive_count: 0, warnings: [] },
    } as never)
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { onGenerate: () => Promise<void> }
    await vm.onGenerate()

    expect(ElMessageBox.confirm).toHaveBeenCalledWith(
      expect.stringContaining('不會執行匯款'),
      expect.any(String),
      expect.anything(),
    )
  })

  it('generate 成功 → 顯示收據卡（人數/總額/離職納入與略過數）與轉帳名冊連結（href 含 cycle_id）', async () => {
    vi.mocked(api.previewAppraisalPayout).mockResolvedValue({
      data: [
        mockPreviewRow({ employee_id: 1 }),
        mockPreviewRow({ employee_id: 3, is_inactive: true }),
      ],
    } as never)
    vi.mocked(api.generateAppraisalPayout).mockResolvedValue({
      data: { cycle_id: 77, generated_count: 4, affected_employee_count: 2, total_amount: '27200', skipped_inactive_count: 1, warnings: [] },
    } as never)
    vi.mocked(api.listAppraisalPayouts).mockResolvedValue({ data: [] } as never)
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      toggleSelect: (id: number, checked: boolean) => void
      onGenerate: () => Promise<void>
      tab: string
    }
    vm.toggleSelect(3, true)
    await vm.onGenerate()
    await nextTick()
    await nextTick()

    // 成功訊息不再是含糊的「已生成」
    expect(ElMessage.success).toHaveBeenCalledWith('發放資料已建立')
    expect(vm.tab).toBe('generated')

    const receipt = wrapper.find('[data-test="generate-receipt"]')
    expect(receipt.exists()).toBe(true)
    expect(receipt.text()).toContain('2 人')
    expect(receipt.text()).toContain('NT$27,200')
    expect(receipt.text()).toContain('納入離職員工 1 位')
    expect(receipt.text()).toContain('未納入 1 位')

    const rosterLink = wrapper.find('[data-test="receipt-roster-link"]')
    expect(rosterLink.exists()).toBe(true)
    expect(rosterLink.attributes('href')).toContain('/year_end/cycles/77/transfer_roster.xlsx')
  })

  it('預覽列 warnings 英文代碼中文化（不得出現原始代碼）', async () => {
    vi.mocked(api.previewAppraisalPayout).mockResolvedValue({
      data: [mockPreviewRow({ warnings: ['inactive_employee', 'earlier_summary_not_finalized'] })],
    } as never)
    const wrapper = await mountView()

    const text = wrapper.text()
    expect(text).toContain('已離職')
    expect(text).toContain('上學期考核未核定')
    expect(text).not.toContain('inactive_employee')
    expect(text).not.toContain('earlier_summary_not_finalized')
  })

  // 2026-07-31 QA 缺陷：來源學年考核 cycle 未建立時後端回 422，detail 是給開發者看的
  // 內部訊息（如「appraisal_cycle academic_year=113 FIRST 不存在」）。年份換算本身正確
  // （非後端 bug），前端不該把這段原文當紅色 toast 丟給使用者，改顯示友善空狀態。
  it('422（來源 cycle 未建立）→ 不噴 toast、改顯示友善空狀態，不含後端內部訊息', async () => {
    const detail = 'appraisal_cycle academic_year=113 FIRST 不存在；請先在考核管理建立此 cycle'
    vi.mocked(api.previewAppraisalPayout).mockRejectedValue({ response: { status: 422, data: { detail } } })
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { notReady: boolean; rows: unknown[] }

    expect(vm.notReady).toBe(true)
    expect(vm.rows).toEqual([])
    expect(ElMessage.error).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain(detail)
    expect(wrapper.text()).toContain('尚無可發放的考核年終資料')
  })

  // 其他狀態碼（500 等）維持既有紅色 toast 錯誤處理，不進 notReady 空狀態。
  it('500（非資料態問題）→ 維持既有 toast 錯誤處理，不進入友善空狀態', async () => {
    vi.mocked(api.previewAppraisalPayout).mockRejectedValue({ response: { status: 500 } })
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { notReady: boolean }

    expect(vm.notReady).toBe(false)
    expect(ElMessage.error).toHaveBeenCalled()
  })

  // 422 後改切到已有資料的年份：友善空狀態要能解除，恢復顯示預覽表格。
  it('422 後切換到有資料的年份 → notReady 解除', async () => {
    vi.mocked(api.previewAppraisalPayout).mockRejectedValueOnce({ response: { status: 422 } })
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { notReady: boolean; year: number }
    expect(vm.notReady).toBe(true)

    vi.mocked(api.previewAppraisalPayout).mockResolvedValue({ data: [mockPreviewRow()] } as never)
    vm.year = 2025
    await nextTick()
    await flushPromises()

    expect(vm.notReady).toBe(false)
  })

  it('loadPreview() 非422失敗時顯示錯誤區塊，重試成功後消失', async () => {
    vi.mocked(api.previewAppraisalPayout).mockRejectedValueOnce(new Error('network error'))
    const wrapper = await mountView()

    expect(wrapper.find('[data-test="preview-load-retry"]').exists()).toBe(true)

    vi.mocked(api.previewAppraisalPayout).mockResolvedValueOnce({ data: [] } as never)
    await wrapper.find('[data-test="preview-load-retry"]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-test="preview-load-retry"]').exists()).toBe(false)
    expect(api.previewAppraisalPayout).toHaveBeenCalledTimes(2)
  })

  it('loadGenerated() 失敗時顯示錯誤區塊，重試成功後消失', async () => {
    vi.mocked(api.previewAppraisalPayout).mockResolvedValue({ data: [] } as never)
    vi.mocked(api.listAppraisalPayouts).mockRejectedValueOnce(new Error('network error'))
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { tab: 'preview' | 'generated' }
    vm.tab = 'generated'
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-test="generated-load-retry"]').exists()).toBe(true)

    vi.mocked(api.listAppraisalPayouts).mockResolvedValueOnce({ data: [] } as never)
    await wrapper.find('[data-test="generated-load-retry"]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-test="generated-load-retry"]').exists()).toBe(false)
    expect(api.listAppraisalPayouts).toHaveBeenCalledTimes(2)
  })
})
