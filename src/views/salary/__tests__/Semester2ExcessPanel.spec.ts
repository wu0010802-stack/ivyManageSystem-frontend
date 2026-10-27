import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import Semester2ExcessPanel from '../Semester2ExcessPanel.vue'

// 下學期（2–7 月）超額獎金 7 月表外批次：審查修補後，人工列與系統列並存時套用會移除系統列，
// 套用結果也會回報因人工登錄移除、去重的系統列。
vi.mock('@/api/extraBonuses', () => ({
  previewSemester2Excess: vi.fn(),
  applySemester2Excess: vi.fn(),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn() },
  }
})

const { permState } = vi.hoisted(() => ({
  permState: { perms: new Set<string>(), fullView: true },
}))
vi.mock('@/utils/auth', () => ({
  hasPermission: (name: string) => permState.perms.has(name),
  hasFullSalaryView: () => permState.fullView,
}))

import * as api from '@/api/extraBonuses'
import { ElMessage, ElMessageBox } from 'element-plus'

const row = (over: Record<string, unknown> = {}) => ({
  employee_id: 1,
  employee_name: '林老師',
  amount: 1200,
  months: { '116-02': '600', '116-03': '600' },
  eligible: true,
  ineligible_reason: null,
  existing_auto_amount: null,
  has_manual_payment: false,
  auto_and_manual_coexist: false,
  ...over,
})

const PREVIEW = {
  academic_year: 115,
  period_year: 2027,
  period_month: 7,
  pending_rules: [],
  warnings: [],
  total_amount: 1200,
  rows: [
    row(),
    row({
      employee_id: 2,
      employee_name: '王老師',
      amount: 800,
      has_manual_payment: true,
      existing_auto_amount: 800,
      auto_and_manual_coexist: true,
    }),
    row({ employee_id: 3, employee_name: '李老師', amount: 500, has_manual_payment: true }),
  ],
}

const APPLY_RESULT = {
  academic_year: 115,
  period_year: 2027,
  period_month: 7,
  created: [],
  updated: [],
  deleted: [],
  skipped_manual: [{ employee_id: 2, employee_name: '王老師', amount: 0 }],
  skipped_self: [],
  removed_duplicates: [],
  removed_for_manual: [{ employee_id: 2, employee_name: '王老師', amount: 800 }],
  total_amount: 0,
}

const ColumnStub = defineComponent({
  props: { data: { type: Array, default: () => [] }, prop: { type: String, default: '' } },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        { class: 'col-stub' },
        (props.data as Record<string, unknown>[]).map((r, i) =>
          h('div', { key: i }, slots.default ? slots.default({ row: r }) : String(r[props.prop] ?? '')),
        ),
      )
  },
})
const TableStub = defineComponent({
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        { class: 'el-table' },
        (slots.default?.() || []).map((vnode, i) => h(vnode.type, { ...vnode.props, data: props.data, key: i }, vnode.children)),
      )
  },
})
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup(_, { attrs, emit, slots }) {
    const dataAttrs = Object.fromEntries(Object.entries(attrs).filter(([k]) => k === 'type' || k.startsWith('data-')))
    return () => h('button', { ...dataAttrs, onClick: () => emit('click') }, slots.default?.())
  },
})
const AlertStub = defineComponent({
  props: { title: { type: String, default: '' }, description: { type: String, default: '' } },
  setup(props, { attrs }) {
    return () => h('div', { ...attrs, class: 'alert', title: props.title, description: props.description })
  },
})

async function mountPanel() {
  const wrapper = mount(Semester2ExcessPanel, {
    global: {
      stubs: {
        'el-card': defineComponent({ setup: (_, { slots }) => () => h('div', [slots.header?.(), slots.default?.()]) }),
        'el-table': TableStub,
        'el-table-column': ColumnStub,
        'el-button': ButtonStub,
        'el-alert': AlertStub,
        'el-tag': { template: '<span class="tag"><slot /></span>' },
        'el-select': true,
        'el-option': true,
      },
      directives: { loading: () => {} },
    },
  })
  await flushPromises()
  return wrapper
}

const applyButton = (wrapper: Awaited<ReturnType<typeof mountPanel>>) =>
  wrapper.findAll('button').find((b) => b.text().includes('產生／更新批次'))!

describe('Semester2ExcessPanel — 並存列與移除結果', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    permState.perms = new Set(['SALARY_READ', 'SALARY_WRITE'])
    permState.fullView = true
    vi.mocked(api.previewSemester2Excess).mockResolvedValue({ data: PREVIEW } as never)
  })

  it('人工列與系統列並存的列標示「並存」並說明套用會移除多少；只有人工列、沒並存的不標', async () => {
    const wrapper = await mountPanel()

    const notes = wrapper.findAll('[data-test="coexist-note"]')
    expect(notes).toHaveLength(1)
    expect(notes[0].text()).toContain('並存')
    expect(notes[0].text()).toContain('NT$800')
    expect(notes[0].text()).toContain('移除')
    // 兩個人工列都仍標示「已有人工登錄（不覆寫）」
    expect(wrapper.text().match(/已有人工登錄（不覆寫）/g)).toHaveLength(2)
  })

  it('套用確認文案點出有幾位並存、系統列會被移除', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
    vi.mocked(api.applySemester2Excess).mockResolvedValue({ data: APPLY_RESULT } as never)
    const wrapper = await mountPanel()

    await applyButton(wrapper).trigger('click')
    await flushPromises()

    const message = vi.mocked(ElMessageBox.confirm).mock.calls[0][0] as string
    expect(message).toContain('1 位同時有人工登錄與系統產生的列')
    expect(message).toContain('移除系統列')
  })

  it('沒有並存列時確認文案不多一句', async () => {
    vi.mocked(api.previewSemester2Excess).mockResolvedValue({ data: { ...PREVIEW, rows: [row()] } } as never)
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
    vi.mocked(api.applySemester2Excess).mockResolvedValue({ data: APPLY_RESULT } as never)
    const wrapper = await mountPanel()

    await applyButton(wrapper).trigger('click')
    await flushPromises()

    expect(vi.mocked(ElMessageBox.confirm).mock.calls[0][0] as string).not.toContain('同時有人工登錄')
  })

  it('套用結果顯示因人工登錄移除、去重的系統列與被移除金額', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
    vi.mocked(api.applySemester2Excess).mockResolvedValue({
      data: { ...APPLY_RESULT, removed_duplicates: [{ employee_id: 1, employee_name: '林老師', amount: 600 }] },
    } as never)
    const wrapper = await mountPanel()

    await applyButton(wrapper).trigger('click')
    await flushPromises()

    expect(ElMessage.success).toHaveBeenCalled()
    const alerts = wrapper.findAll('.alert')
    const result = alerts.find((a) => (a.attributes('title') ?? '').includes('本次執行'))!
    expect(result.attributes('title')).toContain('因人工登錄移除系統列 1 位')
    expect(result.attributes('title')).toContain('去除重複系統列 1 位')
    expect(result.attributes('description')).toContain('王老師 NT$800')
    expect(result.attributes('description')).toContain('林老師 NT$600')
  })

  it('舊後端沒回移除欄位時，結果只顯示原有的新增／更新／移除', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
    const legacy: Record<string, unknown> = { ...APPLY_RESULT }
    delete legacy.removed_duplicates
    delete legacy.removed_for_manual
    vi.mocked(api.applySemester2Excess).mockResolvedValue({ data: legacy } as never)
    const wrapper = await mountPanel()

    await applyButton(wrapper).trigger('click')
    await flushPromises()

    const result = wrapper.findAll('.alert').find((a) => (a.attributes('title') ?? '').includes('本次執行'))!
    expect(result.attributes('title')).not.toContain('移除系統列')
    expect(result.attributes('title')).not.toContain('去除重複')
  })
})
