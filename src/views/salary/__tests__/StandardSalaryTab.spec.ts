import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, type VNode } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import StandardSalaryTab from '@/views/salary/components/StandardSalaryTab.vue'
import {
  describeBelowMinimumWage,
  describeNeedsConfirmation,
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
