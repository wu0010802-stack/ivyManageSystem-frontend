/**
 * SPEC-019 §7 現金項目檢視：批次列表／批次逐生（收現金）／新生預繳區塊。
 *
 * ⚠ el-table-column stub 陷阱：真實 Element Plus 的 `<el-table-column>` 靠
 * `<el-table>` 內部把每列資料傳給欄位插槽 `#default="{ row }"`；一個不處理
 * 插槽的簡單 stub（`{ template: '<span />' }`）會讓所有 `#default` 內容
 * （含本檔斷言要找的 data-test 節點）整個消失、測試在完全沒渲染欄位內容的
 * 情況下也可能誤判通過或誤判失敗。這裡比照 BillSlipTab.test.ts 的寫法，
 * 用 provide/inject 把 `el-table` 的 `data` 轉給 `el-table-column` 逐列展開。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, inject, provide } from 'vue'

const apiMocks = vi.hoisted(() => ({
  getCashFeeBatches: vi.fn(),
  getCashFeeBatch: vi.fn(),
  deleteCashFeeBatch: vi.fn(() => Promise.resolve({ ok: true })),
  getPrepayments: vi.fn(() =>
    Promise.resolve({
      total: 1,
      items: [
        {
          id: 9,
          student_id: null,
          student_name: null,
          recruitment_visit_id: 77,
          visit_child_name: '新生甲',
          target_school_year: 115,
          target_semester: 1,
          original_amount: 5000,
          status: 'available',
          balance: 5000,
        },
      ],
    }),
  ),
  getPrepaymentRefunds: vi.fn(() => Promise.resolve({ total: 0, items: [] })),
}))
vi.mock('@/api/fees', () => apiMocks)
const authMocks = vi.hoisted(() => ({ perms: new Set<string>(['FEES_READ', 'FEES_WRITE']) }))
vi.mock('@/utils/auth', () => ({ hasPermission: (n: string) => authMocks.perms.has(n) }))
vi.mock('@/utils/academic', () => ({ getCurrentAcademicTerm: () => ({ school_year: 115, semester: 1 }) }))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() },
  ElMessageBox: { confirm: vi.fn(() => Promise.resolve()) },
}))
// ⚠ vi.mock 的路徑必須是靜態字串常值才會被 hoist 到 import 之前；用迴圈＋
// template literal 組路徑（`@/components/fees/${name}.vue`）不會被正確 hoist，
// mock 在真正的 import 執行之後才註冊，等於沒 mock 到（元件會渲染真的那顆，
// 內部呼叫 useAllClassroomStore 等會炸「no active Pinia」）。改成逐一寫死路徑。
function stubFeesComponent(name: string) {
  return {
    __esModule: true,
    default: {
      name,
      props: {
        modelValue: Boolean,
        studentId: { type: Number, default: null },
        preselectRecordIds: { type: Array, default: () => [] },
        credits: { type: Array, default: () => [] },
        refunds: { type: Array, default: () => [] },
        title: String,
      },
      emits: ['update:modelValue', 'created', 'received', 'paid', 'refresh', 'pick'],
      template: `<div data-testid="${name}" :data-open="modelValue ? '1' : '0'" :data-student="studentId" :data-preselect="(preselectRecordIds || []).join(',')" />`,
    },
  }
}
vi.mock('@/components/fees/CashFeeBatchDialog.vue', () => stubFeesComponent('CashFeeBatchDialog'))
vi.mock('@/components/fees/PrepaymentCashReceiptDialog.vue', () =>
  stubFeesComponent('PrepaymentCashReceiptDialog'),
)
vi.mock('@/components/fees/StudentCashReceiptDialog.vue', () => stubFeesComponent('StudentCashReceiptDialog'))
vi.mock('@/components/fees/PrepaymentDrawer.vue', () => stubFeesComponent('PrepaymentDrawer'))
vi.mock('@/components/fees/PrepaymentRefundsDialog.vue', () => stubFeesComponent('PrepaymentRefundsDialog'))
vi.mock('@/components/fees/StudentPickerDialog.vue', () => stubFeesComponent('StudentPickerDialog'))

import CashItemsView from '@/components/fees/CashItemsView.vue'

const BATCH = {
  id: 3,
  kind: 'material',
  title: '115-1 教材費',
  school_year: 115,
  semester: 1,
  due_date: '2026-09-15',
  note: null,
  created_at: '2026-09-01T10:00:00',
  student_count: 2,
  total_due: 5000,
  total_paid: 2500,
  outstanding: 2500,
}

// el-table stub 把 data 透過 provide 交給 el-table-column，逐列展開 #default 插槽
// （trap #2：不處理插槽的簡單 stub 會讓欄位內容整個消失）
const TABLE_ROWS = Symbol('table-rows')

const ElTableStub = defineComponent({
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    provide(TABLE_ROWS, props)
    return () =>
      h(
        'div',
        { 'data-testid': 'table' },
        props.data.length === 0 ? [slots.empty?.()] : [slots.default?.()],
      )
  },
})

const ElTableColumnStub = defineComponent({
  setup(_props, { slots }) {
    const holder = inject<{ data: unknown[] }>(TABLE_ROWS, { data: [] })
    return () =>
      h(
        'span',
        (holder.data ?? []).map((row) => h('span', slots.default?.({ row }))),
      )
  },
})

const STUBS = {
  'el-table': ElTableStub,
  'el-table-column': ElTableColumnStub,
  'el-button': { template: '<button type="button" v-bind="$attrs"><slot /></button>' },
  'el-tag': { template: '<span v-bind="$attrs"><slot /></span>' },
  'el-select': { template: '<select v-bind="$attrs"><slot /></select>' },
  'el-option': { template: '<option />' },
  EmptyState: { props: ['title'], template: '<div data-testid="empty">{{ title }}</div>' },
}

describe('CashItemsView', () => {
  beforeEach(() => {
    apiMocks.getCashFeeBatches.mockResolvedValue([BATCH])
    apiMocks.getCashFeeBatch.mockResolvedValue({
      batch: BATCH,
      items: [
        {
          record_id: 41,
          student_id: 5,
          student_name: '王小明',
          classroom_name: '天堂鳥班',
          amount_due: 2500,
          amount_paid: 0,
          status: 'unpaid',
          settlement: {},
        },
        {
          record_id: 42,
          student_id: 6,
          student_name: '陳小美',
          classroom_name: '芙蓉班',
          amount_due: 2500,
          amount_paid: 2500,
          status: 'paid',
          settlement: { cash_confirmed: 2500 },
        },
      ],
    })
  })

  it('載入批次列表（當前學期）並顯示合計；點列載入逐生', async () => {
    const w = mount(CashItemsView, { global: { stubs: STUBS } })
    await flushPromises()
    expect(apiMocks.getCashFeeBatches).toHaveBeenCalledWith({ school_year: 115, semester: 1 })
    expect(w.find('[data-test="cfb-list-row"]').text()).toContain('115-1 教材費')
    await w.find('[data-test="cfb-list-row"] [data-test="cfb-open"]').trigger('click')
    await flushPromises()
    const rows = w.findAll('[data-test="cfb-item-row"]')
    expect(rows).toHaveLength(2)
    expect(rows[1].find('[data-test="cfb-item-pay"]').exists()).toBe(false)
    await rows[0].find('[data-test="cfb-item-pay"]').trigger('click')
    const dlg = w.find('[data-testid="StudentCashReceiptDialog"]')
    expect(dlg.attributes('data-open')).toBe('1')
    expect(dlg.attributes('data-student')).toBe('5')
    expect(dlg.attributes('data-preselect')).toBe('41')
  })

  it('新生預繳區塊列出訪視額度並可開登記 dialog', async () => {
    const w = mount(CashItemsView, { global: { stubs: STUBS } })
    await flushPromises()
    expect(w.find('[data-test="ppd-credit-row"]').text()).toContain('新生甲')
    await w.find('[data-test="ppd-open"]').trigger('click')
    expect(w.find('[data-testid="PrepaymentCashReceiptDialog"]').attributes('data-open')).toBe('1')
  })

  it('唯讀權限：無建批／收現金／登記預繳按鈕', async () => {
    authMocks.perms = new Set(['FEES_READ'])
    const w = mount(CashItemsView, { global: { stubs: STUBS } })
    await flushPromises()
    expect(w.find('[data-test="cfb-create-open"]').exists()).toBe(false)
    expect(w.find('[data-test="ppd-open"]').exists()).toBe(false)
    authMocks.perms = new Set(['FEES_READ', 'FEES_WRITE'])
  })
})
