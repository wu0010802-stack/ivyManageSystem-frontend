import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, type VNode } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import StandardSalaryTab from '@/views/salary/components/StandardSalaryTab.vue'
import {
  describeBelowMinimumWage,
  describeNeedsConfirmation,
  pickSyncMinimumWageBlock,
  requiresGradeDefaultConfirm,
} from '@/views/salary/components/standardSalaryNotices'

/**
 * 職位標準底薪 tab（義華 2026-10-22 薪資比對）：
 * - #54 帶班但職稱與等級皆空白（高琦雅 33,000 → C 級 29,500）：同步前須確認，
 *   並把確認的員工 id 送 confirm_grade_default_employee_ids；批次同步被略過者要提示。
 * - #61 職位標準低於基本工資：儲存後提示 below_minimum_wage。
 * - #57 園長／主任只有一欄：留空不套用的提示。
 */

const getPositionSalary = vi.fn()
const updatePositionSalary = vi.fn()
const comparePositionSalary = vi.fn()
const syncPositionSalary = vi.fn()

vi.mock('@/api/config', () => ({
  getPositionSalary: (...a: unknown[]) => getPositionSalary(...a),
  updatePositionSalary: (...a: unknown[]) => updatePositionSalary(...a),
  comparePositionSalary: (...a: unknown[]) => comparePositionSalary(...a),
  syncPositionSalary: (...a: unknown[]) => syncPositionSalary(...a),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn(), prompt: vi.fn() },
}))

// 資安稽核 2026-10-29 P3：PUT /config/position-salary 後端改需金流簽核
// （require_salary_config_finance_approve）。預設授予兩權限，個別測試再移除。
const granted = vi.hoisted(() => new Set<string>())
vi.mock('@/utils/auth', () => ({
  hasPermission: (name: string) => granted.has(name),
}))

const ElTableColumnStub = defineComponent({
  name: 'ElTableColumnStub',
  props: { data: { type: Array, default: () => [] }, label: { type: String, default: '' } },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        { class: 'col', 'data-label': props.label },
        (props.data as Record<string, unknown>[]).map((row, index) =>
          h('div', { key: index }, slots.default ? slots.default({ row }) : []),
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
        (slots.default?.() || []).map((vnode: VNode, index: number) =>
          h(vnode.type as string, { ...vnode.props, data: props.data, key: index }, vnode.children as never),
        ),
      )
  },
})

const ElButtonStub = defineComponent({
  name: 'ElButtonStub',
  emits: ['click'],
  setup(_p, { slots, emit, attrs }) {
    return () => h('button', { ...attrs, onClick: () => emit('click') }, slots.default?.())
  },
})

const STUBS = {
  'el-table': ElTableStub,
  'el-table-column': ElTableColumnStub,
  'el-button': ElButtonStub,
}

const GAO = {
  employee_id: 27,
  name: '高琦雅',
  title: '',
  position: '副班導',
  bonus_grade: null,
  standard_key: 'assistant_teacher_c',
  current_salary: 33000,
  standard_salary: 29500,
  diff: 3500,
  in_sync: false,
  grade_defaulted: true,
  warning: '帶班但職稱與等級皆空白，將以 C 級標準 29,500 計薪；請補報聘職稱或指定等級（bonus_grade）',
}

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve()
}

const mountTab = async () => {
  const wrapper = mount(StandardSalaryTab, { global: { stubs: STUBS, directives: { loading: {} } } })
  await flush()
  await wrapper.vm.$nextTick()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  granted.clear()
  granted.add('SETTINGS_WRITE').add('ACTIVITY_PAYMENT_APPROVE')
  getPositionSalary.mockResolvedValue({ data: {} })
  comparePositionSalary.mockResolvedValue({ data: { employees: [GAO], out_of_sync: 1 } })
  syncPositionSalary.mockResolvedValue({ data: { total_updated: 1, updated: [], needs_confirmation: [] } })
  updatePositionSalary.mockResolvedValue({ data: { below_minimum_wage: [] } })
  ;(ElMessageBox.prompt as ReturnType<typeof vi.fn>).mockResolvedValue({ value: '  依職位標準同步  ' })
})

const syncButtonOf = (wrapper: Awaited<ReturnType<typeof mountTab>>) =>
  wrapper.findAll('button').find((b) => b.text() === '同步')!

describe('StandardSalaryTab — #54 預設 C 級同步確認', () => {
  it('比對表標示預設 C 級', async () => {
    const wrapper = await mountTab()
    expect(wrapper.text()).toContain('預設 C')
  })

  it('取消確認則不送出同步', async () => {
    ;(ElMessageBox.confirm as ReturnType<typeof vi.fn>).mockRejectedValue('cancel')
    const wrapper = await mountTab()
    await syncButtonOf(wrapper).trigger('click')
    await flush()
    expect(ElMessageBox.confirm).toHaveBeenCalled()
    expect(syncPositionSalary).not.toHaveBeenCalled()
  })

  it('確認後送出 confirm id', async () => {
    ;(ElMessageBox.confirm as ReturnType<typeof vi.fn>).mockResolvedValue('confirm')
    const wrapper = await mountTab()
    await syncButtonOf(wrapper).trigger('click')
    await flush()
    expect(syncPositionSalary).toHaveBeenCalledWith({
      employee_ids: [27],
      confirm_grade_default_employee_ids: [27],
      adjustment_reason: '依職位標準同步',
    })
  })

  it('批次同步略過者顯示提示', async () => {
    syncPositionSalary.mockResolvedValue({
      data: {
        total_updated: 0,
        updated: [],
        needs_confirmation: [
          { employee_id: 27, name: '高琦雅', current_salary: 33000, standard_salary: 29500 },
        ],
      },
    })
    const wrapper = await mountTab()
    const batch = wrapper.findAll('button').find((b) => b.text().startsWith('批次同步全部'))!
    await batch.trigger('click')
    await flush()
    expect(syncPositionSalary).toHaveBeenCalledWith({ employee_ids: [], adjustment_reason: '依職位標準同步' })
    expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('高琦雅'))
  })
})

describe('StandardSalaryTab — 同步必填調薪原因（後端 adjustment_reason 必填）', () => {
  it('取消輸入原因則不送出同步', async () => {
    ;(ElMessageBox.confirm as ReturnType<typeof vi.fn>).mockResolvedValue('confirm')
    ;(ElMessageBox.prompt as ReturnType<typeof vi.fn>).mockRejectedValue('cancel')
    const wrapper = await mountTab()
    await syncButtonOf(wrapper).trigger('click')
    await flush()
    expect(ElMessageBox.prompt).toHaveBeenCalled()
    expect(syncPositionSalary).not.toHaveBeenCalled()
  })

  it('批次同步取消輸入原因則不送出', async () => {
    ;(ElMessageBox.prompt as ReturnType<typeof vi.fn>).mockRejectedValue('cancel')
    const wrapper = await mountTab()
    const batch = wrapper.findAll('button').find((b) => b.text().startsWith('批次同步全部'))!
    await batch.trigger('click')
    await flush()
    expect(syncPositionSalary).not.toHaveBeenCalled()
  })

  it('原因輸入框驗證至少 5 字', async () => {
    ;(ElMessageBox.confirm as ReturnType<typeof vi.fn>).mockResolvedValue('confirm')
    const wrapper = await mountTab()
    await syncButtonOf(wrapper).trigger('click')
    await flush()
    const opts = (ElMessageBox.prompt as ReturnType<typeof vi.fn>).mock.calls[0][2] as {
      inputValidator: (v: string) => boolean | string
    }
    expect(opts.inputValidator('  四個字  ')).not.toBe(true)
    expect(opts.inputValidator('依職位標準同步')).toBe(true)
  })
})

describe('StandardSalaryTab — #61 低於基本工資提示', () => {
  it('儲存後回傳 below_minimum_wage 顯示警告', async () => {
    updatePositionSalary.mockResolvedValue({
      data: { below_minimum_wage: [{ key: 'assistant_teacher_c', value: 29000, minimum: 29500 }] },
    })
    const wrapper = await mountTab()
    const save = wrapper.findAll('button').find((b) => b.text() === '儲存職位底薪設定')!
    await save.trigger('click')
    await flush()
    expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('副班導師 C 級 $29,000'))
  })
})

describe('StandardSalaryTab — #57 園長／主任留空提示', () => {
  it('主任欄說明留空不套用、A/B 兩級用個人底薪', async () => {
    const wrapper = await mountTab()
    expect(wrapper.text()).toContain('主任')
    expect(wrapper.text()).toContain('核薪表分 A/B 兩級時請留空')
  })
})

describe('standardSalaryNotices 純函式', () => {
  it('describeBelowMinimumWage', () => {
    expect(describeBelowMinimumWage([], {})).toBeNull()
    expect(
      describeBelowMinimumWage([{ key: 'driver', value: 29000, minimum: 29500 }], { driver: '司機' }),
    ).toBe('以下職位標準低於該年度基本工資 $29,500：司機 $29,000')
  })

  it('describeNeedsConfirmation', () => {
    expect(describeNeedsConfirmation([])).toBeNull()
    expect(
      describeNeedsConfirmation([{ employee_id: 1, name: '高琦雅', current_salary: 33000, standard_salary: 29500 }]),
    ).toContain('高琦雅')
  })

  it('requiresGradeDefaultConfirm 只對調降', () => {
    expect(requiresGradeDefaultConfirm({ grade_defaulted: true, diff: 3500 })).toBe(true)
    expect(requiresGradeDefaultConfirm({ grade_defaulted: true, diff: -500 })).toBe(false)
    expect(requiresGradeDefaultConfirm({ grade_defaulted: false, diff: 3500 })).toBe(false)
  })
})

describe('StandardSalaryTab — 同步後低於基本工資整批 422（後端 b405e8ec，使用者 2026-10-28 裁定）', () => {
  const BLOCK_DETAIL = {
    code: 'SYNC_BELOW_MINIMUM_WAGE',
    message: '1 位員工同步後底薪低於法定基本工資（勞基法第 21 條），整批未同步；請先調整職位標準或排除這些員工後再同步',
    employees: [
      { employee_id: 27, name: '高琦雅', new_salary: 27000, minimum: 28590, shortfall: 1590, message: '低於基本工資' },
    ],
  }
  const blockError = () => ({ response: { status: 422, data: { detail: BLOCK_DETAIL } } })

  it('pickSyncMinimumWageBlock 只認 SYNC_BELOW_MINIMUM_WAGE 的 422', () => {
    expect(pickSyncMinimumWageBlock(blockError())?.employees[0].name).toBe('高琦雅')
    expect(pickSyncMinimumWageBlock({ response: { status: 422, data: { detail: 'x' } } })).toBeNull()
    expect(pickSyncMinimumWageBlock({ response: { status: 400, data: { detail: BLOCK_DETAIL } } })).toBeNull()
    expect(pickSyncMinimumWageBlock(new Error('boom'))).toBeNull()
  })

  it('批次同步被擋 → 列出姓名、同步後底薪、基本工資、差額', async () => {
    syncPositionSalary.mockRejectedValue(blockError())
    const wrapper = await mountTab()
    const batch = wrapper.findAll('button').find((b) => b.text().startsWith('批次同步全部'))!
    await batch.trigger('click')
    await flush()
    await wrapper.vm.$nextTick()
    const block = wrapper.find('[data-test="sync-min-wage-block"]')
    expect(block.exists()).toBe(true)
    const text = block.text()
    expect(text).toContain('高琦雅')
    expect(text).toContain('27,000')
    expect(text).toContain('28,590')
    expect(text).toContain('1,590')
    expect(ElMessage.error).toHaveBeenCalledWith(expect.stringContaining('整批未同步'))
  })

  it('比對預覽 sync_blocked_by_minimum_wage → 標示低於基本工資並停用單筆同步', async () => {
    comparePositionSalary.mockResolvedValue({
      data: {
        employees: [{ ...GAO, grade_defaulted: false, sync_blocked_by_minimum_wage: true, minimum_wage: 28590 }],
        out_of_sync: 1,
        sync_blocked_count: 1,
      },
    })
    const wrapper = await mountTab()
    expect(wrapper.text()).toContain('低於基本工資')
    expect(wrapper.find('[data-test="sync-blocked-count"]').text()).toContain('1 人')
    expect(syncButtonOf(wrapper).attributes('disabled')).toBeDefined()
  })
})

describe('StandardSalaryTab — 職位標準底薪改需金流簽核（資安稽核 2026-10-29）', () => {
  const saveButtonOf = (wrapper: Awaited<ReturnType<typeof mountTab>>) =>
    wrapper.findAll('button').find((b) => b.text() === '儲存職位底薪設定')!

  it('缺金流簽核：儲存鈕停用、說明權限需求，且不送出', async () => {
    granted.delete('ACTIVITY_PAYMENT_APPROVE')
    const wrapper = await mountTab()
    const save = saveButtonOf(wrapper)
    expect(save.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('金流簽核')
    await save.trigger('click')
    await flush()
    expect(updatePositionSalary).not.toHaveBeenCalled()
  })

  it('缺系統設定寫入：同樣停用', async () => {
    granted.delete('SETTINGS_WRITE')
    const wrapper = await mountTab()
    expect(saveButtonOf(wrapper).attributes('disabled')).toBeDefined()
  })

  it('兩權限皆有：可儲存', async () => {
    const wrapper = await mountTab()
    const save = saveButtonOf(wrapper)
    expect(save.attributes('disabled')).toBeUndefined()
    await save.trigger('click')
    await flush()
    expect(updatePositionSalary).toHaveBeenCalled()
  })
})
