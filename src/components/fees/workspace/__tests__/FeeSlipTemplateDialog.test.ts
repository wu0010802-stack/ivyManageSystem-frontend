/**
 * SPEC-025 繳款單範本對話框：三步狀態機與下載。
 *
 * - 打開即試算，金額欄用後端回的 by_grade 畫（第一次沒有金額也要畫得出來）
 * - 缺金額／缺銷帳碼／重複碼／缺年段各自擋住下一步與下載
 * - 下載走 exportSlipTemplate + saveBlobResponse
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, inject, nextTick, provide } from 'vue'

const apiMocks = vi.hoisted(() => ({
  previewSlipTemplate: vi.fn(),
  exportSlipTemplate: vi.fn(),
}))
vi.mock('@/api/fees', () => apiMocks)

const downloadMocks = vi.hoisted(() => ({ saveBlobResponse: vi.fn() }))
vi.mock('@/utils/download', () => downloadMocks)

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

vi.mock('@/stores/classroomAll', () => ({
  useAllClassroomStore: () => ({ classrooms: [], fetchClassrooms: vi.fn() }),
}))

import FeeSlipTemplateDialog from '../FeeSlipTemplateDialog.vue'

function preview(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'monthly',
    bill_year: 2026,
    bill_month: 9,
    project_code: '998172',
    account_period: '2609',
    rows_total: 2,
    total_amount: 21600,
    active_total: 2,
    excluded_new_students: 0,
    excluded_manual: 0,
    by_grade: [{ grade_name: '大班', student_count: 2, amount: 10800, subtotal: 21600 }],
    missing_suffix: [],
    duplicate_suffix: [],
    missing_grade: [],
    missing_amounts: [],
    sample_rows: [
      {
        student_name: '甲生',
        classroom_label: '天堂鳥班',
        grade_label: '大班',
        collection_suffix: '1101',
        full_collection_number: '99817226091101',
        amount: 10800,
      },
    ],
    amount_defaults: { 大班: 10800 },
    blocked: false,
    ...overrides,
  }
}

// ⚠ repo 的 vitest setup 不註冊 Element Plus——比照
// src/components/fees/__tests__/BillSlipTab.test.ts 自備 pass-through stub。
// 具名 slot（footer）也要渲染，否則下一步／下載按鈕找不到。
//
// 表格欄位的 `#default="{ row }"` 要能展開，故沿用該檔的 provide/inject 手法：
// el-table 把 props 往下 provide，el-table-column 逐列取出來渲染自己的插槽。
const TABLE_ROWS = Symbol('table-rows')

const ElTableStub = defineComponent({
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    provide(TABLE_ROWS, props)
    return () => h('div', { 'data-testid': 'table' }, [slots.default?.()])
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
  'el-dialog': {
    props: ['modelValue', 'title'],
    template:
      '<div v-if="modelValue" v-bind="$attrs"><p>{{ title }}</p><slot /><slot name="footer" /></div>',
  },
  'el-steps': { template: '<div><slot /></div>' },
  'el-step': { props: ['title'], template: '<span>{{ title }}</span>' },
  'el-form': { template: '<form v-bind="$attrs"><slot /></form>' },
  'el-form-item': { props: ['label'], template: '<div><label>{{ label }}</label><slot /></div>' },
  'el-button': { template: '<button type="button" v-bind="$attrs"><slot /></button>' },
  'el-input': { template: '<input v-bind="$attrs" />' },
  'el-input-number': { template: '<input type="number" v-bind="$attrs" />' },
  'el-select': { template: '<select v-bind="$attrs"><slot /></select>' },
  'el-option': { props: ['label', 'value'], template: '<option :value="value">{{ label }}</option>' },
  'el-alert': { props: ['title'], template: '<div v-bind="$attrs">{{ title }}</div>' },
  'el-icon': { template: '<i><slot /></i>' },
}

function mountDialog() {
  return mount(FeeSlipTemplateDialog, {
    props: { modelValue: true, kind: 'monthly', defaultYear: 2026, defaultMonth: 9 },
    global: { stubs: { ...STUBS, teleport: true } },
  })
}

async function settle(wrapper: ReturnType<typeof mountDialog>) {
  await nextTick()
  await nextTick()
  await nextTick()
  return wrapper
}

describe('FeeSlipTemplateDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.previewSlipTemplate.mockResolvedValue(preview())
    apiMocks.exportSlipTemplate.mockResolvedValue({ data: new Blob(), headers: {} })
  })

  it('打開就試算，並帶入預設帳期', async () => {
    const wrapper = await settle(mountDialog())
    expect(apiMocks.previewSlipTemplate).toHaveBeenCalled()
    const payload = apiMocks.previewSlipTemplate.mock.calls[0][0]
    expect(payload.kind).toBe('monthly')
    expect(payload.bill_year).toBe(2026)
    expect(payload.bill_month).toBe(9)
    wrapper.unmount()
  })

  it('顯示各年段人數與金額', async () => {
    const wrapper = await settle(mountDialog())
    expect(wrapper.find('[data-test="slip-grade-row"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('大班')
    wrapper.unmount()
  })

  it('缺金額時擋住下一步', async () => {
    apiMocks.previewSlipTemplate.mockResolvedValue(
      preview({
        by_grade: [{ grade_name: '幼幼班', student_count: 3, amount: null, subtotal: 0 }],
        missing_amounts: ['幼幼班'],
        blocked: true,
        rows_total: 0,
        total_amount: 0,
      }),
    )
    const wrapper = await settle(mountDialog())
    const next = wrapper.find('[data-test="slip-next"]')
    expect(next.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('缺銷帳碼時列出學生與建議號碼，並擋住產檔', async () => {
    apiMocks.previewSlipTemplate.mockResolvedValue(
      preview({
        missing_suffix: [
          {
            student_id: 7,
            student_name: '沒碼',
            classroom_name: '牡丹班',
            suggested_suffix: '4115',
          },
        ],
        blocked: true,
      }),
    )
    const wrapper = await settle(mountDialog())
    await wrapper.find('[data-test="slip-next"]').trigger('click')
    await settle(wrapper)
    expect(wrapper.text()).toContain('沒碼')
    expect(wrapper.text()).toContain('4115')
    expect(wrapper.find('[data-test="slip-download"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="slip-next"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('重複碼會把雙方都列出來', async () => {
    apiMocks.previewSlipTemplate.mockResolvedValue(
      preview({
        duplicate_suffix: [{ collection_suffix: '1101', students: ['甲生', '乙生'] }],
        blocked: true,
      }),
    )
    const wrapper = await settle(mountDialog())
    await wrapper.find('[data-test="slip-next"]').trigger('click')
    await settle(wrapper)
    expect(wrapper.text()).toContain('甲生')
    expect(wrapper.text()).toContain('乙生')
    expect(wrapper.find('[data-test="slip-next"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('缺年段時列出學生，並擋住下一步', async () => {
    apiMocks.previewSlipTemplate.mockResolvedValue(
      preview({
        missing_grade: [{ student_id: 9, student_name: '沒年段', classroom_name: '未知班' }],
        blocked: true,
      }),
    )
    const wrapper = await settle(mountDialog())
    await wrapper.find('[data-test="slip-next"]').trigger('click')
    await settle(wrapper)
    expect(wrapper.text()).toContain('沒年段')
    expect(wrapper.text()).toContain('未知班')
    expect(wrapper.find('[data-test="slip-next"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('走到第三步可下載，並把 blob 交給 saveBlobResponse', async () => {
    const wrapper = await settle(mountDialog())
    await wrapper.find('[data-test="slip-next"]').trigger('click')
    await settle(wrapper)
    await wrapper.find('[data-test="slip-next"]').trigger('click')
    await settle(wrapper)
    await wrapper.find('[data-test="slip-download"]').trigger('click')
    await settle(wrapper)
    expect(apiMocks.exportSlipTemplate).toHaveBeenCalledTimes(1)
    expect(downloadMocks.saveBlobResponse).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('指派銷帳碼會帶進試算 payload', async () => {
    apiMocks.previewSlipTemplate
      .mockResolvedValueOnce(
        preview({
          missing_suffix: [
            {
              student_id: 7,
              student_name: '沒碼',
              classroom_name: '牡丹班',
              suggested_suffix: '4115',
            },
          ],
          blocked: true,
        }),
      )
      .mockResolvedValue(preview())
    const wrapper = await settle(mountDialog())
    await wrapper.find('[data-test="slip-next"]').trigger('click')
    await settle(wrapper)
    await wrapper.find('[data-test="slip-apply-suggested"]').trigger('click')
    await settle(wrapper)
    const lastPreview = apiMocks.previewSlipTemplate.mock.calls.at(-1)?.[0]
    expect(lastPreview.suffix_assignments).toEqual({ '7': '4115' })
    wrapper.unmount()
  })
})
