import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import Semester2ActivityPanel from '../Semester2ActivityPanel.vue'

// 下學期（2–7 月）推動才藝獎勵金＋教課教師獎勵金 8 月表外批次（義華 2026-10-27）。
vi.mock('@/api/extraBonuses', () => ({
  previewSemester2Activity: vi.fn(),
  applySemester2Activity: vi.fn(),
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

const PREVIEW = {
  academic_year: 114,
  period_year: 2026,
  period_month: 8,
  pending_rules: ['下學期班導以年終班級編制（semester_first=False）為準；未建立編制列則推動獎班導段無法計算'],
  warnings: ['員工 9 在排除名單內，不計入教課教師獎勵金'],
  total_amount: 4200,
  rows: [
    {
      employee_id: 1,
      employee_name: '林老師',
      category: 'after_class_promo',
      category_label: '推動才藝獎勵金',
      amount: 3600,
      detail: {
        classes: [{ classroom_id: 1, classroom_name: '向日葵班', j: 12, unit_price: 50, amount: 600 }],
        promoter: { total_j: 120, unit_price: 25, amount: 3000 },
      },
      existing_auto_amount: null,
      has_manual_payment: false,
    },
    {
      employee_id: 1,
      employee_name: '林老師',
      category: 'teaching_extra',
      category_label: '教課教師獎勵金',
      amount: 600,
      detail: {
        courses: [
          { course_id: 3, course_name: '美術', student_count: 10, units: 1, unit_price: 60, amount: 600, multiplier: 1, payable_amount: 600 },
        ],
        admin_half_rule: null,
      },
      existing_auto_amount: 500,
      has_manual_payment: false,
    },
    {
      employee_id: 2,
      employee_name: '王老師',
      category: 'teaching_extra',
      category_label: '教課教師獎勵金',
      amount: 900,
      detail: { courses: [], admin_half_rule: null },
      existing_auto_amount: null,
      has_manual_payment: true,
    },
  ],
}

const APPLY_RESULT = {
  academic_year: 114,
  period_year: 2026,
  period_month: 8,
  created: [{ employee_id: 1, employee_name: '林老師', category: 'after_class_promo', amount: 3600 }],
  updated: [{ employee_id: 1, employee_name: '林老師', category: 'teaching_extra', amount: 600 }],
  deleted: [],
  skipped_manual: [{ employee_id: 2, employee_name: '王老師', category: 'teaching_extra', amount: 0 }],
  skipped_self: [],
  total_amount: 4200,
}

// el-table / el-table-column 需要真的執行 scoped #default slot；沒有 slot 的欄位退回顯示 row[prop]
const ElTableColumnStub = defineComponent({
  name: 'ElTableColumnStub',
  props: { data: { type: Array, default: () => [] }, prop: { type: String, default: '' } },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        { class: 'col-stub' },
        (props.data as Record<string, unknown>[]).map((row, index) =>
          h('div', { key: index }, slots.default ? slots.default({ row }) : String(row[props.prop] ?? '')),
        ),
      )
  },
})
const ElTableStub = defineComponent({
  name: 'ElTableStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () =>
      h(
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
    const dataAttrs = Object.fromEntries(Object.entries(attrs).filter(([k]) => k.startsWith('data-')))
    return () => h('button', { ...dataAttrs, onClick: () => emit('click') }, slots.default?.())
  },
})

async function mountPanel() {
  const wrapper = mount(Semester2ActivityPanel, {
    global: {
      stubs: {
        'el-card': defineComponent({
          setup: (_, { slots }) => () => h('div', [slots.header?.(), slots.default?.()]),
        }),
        'el-table': ElTableStub,
        'el-table-column': ElTableColumnStub,
        'el-button': ElButtonStub,
        'el-alert': true,
        'el-select': true,
        'el-option': true,
      },
      directives: { loading: () => {} },
    },
  })
  await flushPromises()
  return wrapper
}

type PanelVm = {
  academicYear: number
  payableCount: number
  doApply: () => Promise<void>
  applyResult: unknown
}

describe('Semester2ActivityPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    permState.perms = new Set(['SALARY_READ', 'SALARY_WRITE'])
    permState.fullView = true
    vi.mocked(api.previewSemester2Activity).mockResolvedValue({ data: PREVIEW } as never)
  })

  it('掛載時以預設學年載入預覽', async () => {
    const wrapper = await mountPanel()
    const vm = wrapper.vm as unknown as PanelVm

    expect(api.previewSemester2Activity).toHaveBeenCalledTimes(1)
    expect(api.previewSemester2Activity).toHaveBeenCalledWith({ academic_year: vm.academicYear })
  })

  it('列出每位員工每個類別一列，含金額與計算明細', async () => {
    const wrapper = await mountPanel()
    const text = wrapper.text()

    expect(text).toContain('推動才藝獎勵金')
    expect(text).toContain('教課教師獎勵金')
    expect(text).toContain('向日葵班（班導）：12 人次 × 50 元 = 600 元')
    expect(text).toContain('全校推動：120 人次 × 25 元 = 3,000 元')
    expect(text).toContain('美術：10 位幼生 × 1 計次 × 60 元 = 600 元')
    expect(text).toContain('NT$3,600')
  })

  it('待確認口徑與預覽警告各自顯示，不被吞掉', async () => {
    const wrapper = await mountPanel()

    expect(wrapper.findAll('[data-test="pending-rule"]').map((a) => a.attributes('title'))).toEqual(PREVIEW.pending_rules)
    expect(wrapper.findAll('[data-test="preview-warning"]').map((a) => a.attributes('title'))).toEqual(PREVIEW.warnings)
  })

  it('摘要的預計寫入筆數不含金額為 0 或已有人工登錄的列', async () => {
    const wrapper = await mountPanel()

    expect((wrapper.vm as unknown as PanelVm).payableCount).toBe(2)
    expect(wrapper.find('[data-test="summary"]').text()).toContain('歸屬 2026/8')
    expect(wrapper.find('[data-test="summary"]').text()).toContain('預計寫入 2 筆')
  })

  it('已有人工登錄的列標示「不覆寫」，已產生過的系統列顯示既有金額', async () => {
    const wrapper = await mountPanel()
    const text = wrapper.text()

    expect(text).toContain('已有人工登錄（不覆寫）')
    expect(text).toContain('NT$500')
  })

  it('套用：先確認（點明歸屬 8 月與補充保費），確認後送出學年並顯示結果、重新載入預覽', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
    vi.mocked(api.applySemester2Activity).mockResolvedValue({ data: APPLY_RESULT } as never)
    const wrapper = await mountPanel()
    const vm = wrapper.vm as unknown as PanelVm

    await wrapper.find('[data-test="apply-button"]').trigger('click')
    await flushPromises()

    const message = vi.mocked(ElMessageBox.confirm).mock.calls[0][0] as string
    expect(message).toContain('2026/8')
    expect(message).toContain('補充保費')
    expect(message).toContain('預計寫入 2 筆')
    expect(api.applySemester2Activity).toHaveBeenCalledWith({ academic_year: vm.academicYear })
    expect(ElMessage.success).toHaveBeenCalled()
    expect(api.previewSemester2Activity).toHaveBeenCalledTimes(2)

    const result = wrapper.find('[data-test="apply-result"]')
    expect(result.attributes('title')).toContain('新增 1 位、更新 1 位、移除 0 位')
    expect(result.attributes('description')).toContain('已有人工登錄（未覆寫）：王老師（教課教師獎勵金）')
  })

  it('套用時按取消：不呼叫後端', async () => {
    vi.mocked(ElMessageBox.confirm).mockRejectedValue('cancel')
    const wrapper = await mountPanel()

    await wrapper.find('[data-test="apply-button"]').trigger('click')
    await flushPromises()

    expect(api.applySemester2Activity).not.toHaveBeenCalled()
  })

  it('套用失敗：顯示錯誤，不顯示成功結果', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
    vi.mocked(api.applySemester2Activity).mockRejectedValue({
      response: { status: 409, data: { detail: '8 月薪資已封存' } },
    })
    const wrapper = await mountPanel()

    await wrapper.find('[data-test="apply-button"]').trigger('click')
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalled()
    expect(ElMessage.success).not.toHaveBeenCalled()
    expect(wrapper.find('[data-test="apply-result"]').exists()).toBe(false)
  })

  it('只有 SALARY_READ（沒有 SALARY_WRITE）：看得到預覽，沒有套用按鈕', async () => {
    permState.perms = new Set(['SALARY_READ'])
    const wrapper = await mountPanel()

    expect(api.previewSemester2Activity).toHaveBeenCalled()
    expect(wrapper.find('[data-test="apply-button"]').exists()).toBe(false)
  })

  it('沒有全員薪資視野：不打 API，只顯示限制說明', async () => {
    permState.fullView = false
    const wrapper = await mountPanel()

    expect(api.previewSemester2Activity).not.toHaveBeenCalled()
    expect(wrapper.find('[data-test="apply-button"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="summary"]').exists()).toBe(false)
  })

  it('預覽載入失敗：顯示錯誤並清掉舊資料，不假裝有資料', async () => {
    vi.mocked(api.previewSemester2Activity).mockRejectedValue(new Error('boom'))
    const wrapper = await mountPanel()

    expect(ElMessage.error).toHaveBeenCalled()
    expect(wrapper.find('[data-test="summary"]').exists()).toBe(false)
  })

  describe('人工優先：並存列與移除結果（審查修補）', () => {
    const COEXIST_PREVIEW = {
      ...PREVIEW,
      rows: [
        PREVIEW.rows[0],
        { ...PREVIEW.rows[2], existing_auto_amount: 400, auto_and_manual_coexist: true },
      ],
    }

    it('人工列與系統列並存的列標示「並存」並說明套用會移除多少，沒並存的不標', async () => {
      vi.mocked(api.previewSemester2Activity).mockResolvedValue({ data: COEXIST_PREVIEW } as never)
      const wrapper = await mountPanel()

      const notes = wrapper.findAll('[data-test="coexist-note"]')
      expect(notes).toHaveLength(1)
      expect(notes[0].text()).toContain('並存')
      expect(notes[0].text()).toContain('NT$400')
      expect(notes[0].text()).toContain('移除')
    })

    it('套用確認文案點出有幾位並存、系統列會被移除', async () => {
      vi.mocked(api.previewSemester2Activity).mockResolvedValue({ data: COEXIST_PREVIEW } as never)
      vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
      vi.mocked(api.applySemester2Activity).mockResolvedValue({ data: APPLY_RESULT } as never)
      const wrapper = await mountPanel()

      await wrapper.find('[data-test="apply-button"]').trigger('click')
      await flushPromises()

      const message = vi.mocked(ElMessageBox.confirm).mock.calls[0][0] as string
      expect(message).toContain('1 位同時有人工登錄與系統產生的列')
      expect(message).toContain('移除系統列')
    })

    it('沒有並存列時確認文案不多一句', async () => {
      vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
      vi.mocked(api.applySemester2Activity).mockResolvedValue({ data: APPLY_RESULT } as never)
      const wrapper = await mountPanel()

      await wrapper.find('[data-test="apply-button"]').trigger('click')
      await flushPromises()

      expect(vi.mocked(ElMessageBox.confirm).mock.calls[0][0] as string).not.toContain('同時有人工登錄')
    })

    it('套用結果顯示因人工登錄移除、去重的系統列（姓名、類別、被移除金額）', async () => {
      vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
      vi.mocked(api.applySemester2Activity).mockResolvedValue({
        data: {
          ...APPLY_RESULT,
          removed_for_manual: [{ employee_id: 2, employee_name: '王老師', category: 'teaching_extra', amount: 400 }],
          removed_duplicates: [{ employee_id: 1, employee_name: '林老師', category: 'after_class_promo', amount: 3600 }],
        },
      } as never)
      const wrapper = await mountPanel()

      await wrapper.find('[data-test="apply-button"]').trigger('click')
      await flushPromises()

      const result = wrapper.find('[data-test="apply-result"]')
      expect(result.attributes('title')).toContain('因人工登錄移除系統列 1 位')
      expect(result.attributes('title')).toContain('去除重複系統列 1 位')
      expect(result.attributes('description')).toContain('王老師（教課教師獎勵金） NT$400')
      expect(result.attributes('description')).toContain('林老師（推動才藝獎勵金） NT$3,600')
    })
  })

  it('切換學年：重新載入該學年並清掉上一次的執行結果', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
    vi.mocked(api.applySemester2Activity).mockResolvedValue({ data: APPLY_RESULT } as never)
    const wrapper = await mountPanel()
    const vm = wrapper.vm as unknown as PanelVm
    await wrapper.find('[data-test="apply-button"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-test="apply-result"]').exists()).toBe(true)

    const previous = vm.academicYear
    vm.academicYear = previous - 1
    await flushPromises()

    expect(api.previewSemester2Activity).toHaveBeenLastCalledWith({ academic_year: previous - 1 })
    expect(wrapper.find('[data-test="apply-result"]').exists()).toBe(false)
  })
})
