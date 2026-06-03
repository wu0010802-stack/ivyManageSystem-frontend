import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import BonusConfigPanel from '../BonusConfigPanel.vue'

// ---- Mock API modules ----
vi.mock('@/api/config', () => ({
  getBonusConfig: vi.fn(),
  updateBonusConfig: vi.fn(),
  getGradeTargets: vi.fn(),
  updateGradeTargets: vi.fn(),
  getPositionSalary: vi.fn(),
  updatePositionSalary: vi.fn(),
  comparePositionSalary: vi.fn(),
  syncPositionSalary: vi.fn(),
  getTitles: vi.fn(),
  updateTitle: vi.fn(),
}))

vi.mock('@/api/employees', () => ({
  getEmployees: vi.fn(),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { prompt: vi.fn() },
  }
})

vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn().mockReturnValue(true),
}))

import * as configApi from '@/api/config'
import * as employeesApi from '@/api/employees'
import { ElMessageBox } from 'element-plus'

type PanelVm = {
  afterClassAwardRows: { className: string; price: number }[]
  artTeacherEmployeeIds: number[]
  employeeOptions: { id: number; name: unknown }[]
  bonusConfig: Record<string, unknown>
  addAfterClassAwardRow: () => void
  removeAfterClassAwardRow: (i: number) => void
  saveBonusConfig: () => Promise<void>
}

function stubAuxApis() {
  vi.mocked(configApi.getGradeTargets).mockResolvedValue({ data: {} } as never)
  vi.mocked(configApi.getPositionSalary).mockResolvedValue({ data: {} } as never)
  vi.mocked(configApi.comparePositionSalary).mockResolvedValue({
    data: { employees: [], out_of_sync: 0 },
  } as never)
  vi.mocked(configApi.getTitles).mockResolvedValue({ data: [] } as never)
  vi.mocked(employeesApi.getEmployees).mockResolvedValue({
    data: [
      { id: 7, name: '林老師' },
      { id: 9, name: '王老師' },
    ],
  } as never)
}

async function mountPanel() {
  const wrapper = mount(BonusConfigPanel, {
    global: {
      stubs: {
        'el-tabs': true,
        'el-tab-pane': true,
        'el-table': true,
        'el-table-column': true,
        'el-button': true,
        'el-card': true,
        'el-alert': true,
        'el-divider': true,
        'el-empty': true,
        'el-row': true,
        'el-col': true,
        'el-form': true,
        'el-form-item': true,
        'el-input': true,
        'el-input-number': true,
        'el-select': true,
        'el-option': true,
        'el-tooltip': true,
        'el-tag': true,
      },
    },
  })
  await nextTick()
  await nextTick()
  return wrapper
}

describe('BonusConfigPanel 年終規則', () => {
  beforeEach(() => vi.clearAllMocks())

  it('load: dict → afterClassAwardRows，list → artTeacherEmployeeIds', async () => {
    vi.mocked(configApi.getBonusConfig).mockResolvedValue({
      data: {
        art_teacher_unit_price: 30,
        after_class_award_unit_price: { 美術班: 50, 律動班: 40 },
        art_teacher_employee_ids: [7, 9],
        dividend_returning_threshold: 0.8,
        late_deduction_per_time: 50,
      },
    } as never)
    stubAuxApis()

    const wrapper = await mountPanel()
    const vm = wrapper.vm as unknown as PanelVm

    expect(vm.afterClassAwardRows).toEqual([
      { className: '美術班', price: 50 },
      { className: '律動班', price: 40 },
    ])
    expect(vm.artTeacherEmployeeIds).toEqual([7, 9])
    expect(vm.bonusConfig.art_teacher_unit_price).toBe(30)
    expect(vm.bonusConfig.dividend_returning_threshold).toBe(0.8)
    expect(vm.employeeOptions).toHaveLength(2)
  })

  it('load: 缺 JSON 欄位時 graceful 退成空（不炸）', async () => {
    vi.mocked(configApi.getBonusConfig).mockResolvedValue({
      data: { art_teacher_unit_price: 0 },
    } as never)
    stubAuxApis()

    const wrapper = await mountPanel()
    const vm = wrapper.vm as unknown as PanelVm

    expect(vm.afterClassAwardRows).toEqual([])
    expect(vm.artTeacherEmployeeIds).toEqual([])
  })

  it('save: afterClassAwardRows → dict（略過空班名）、ids → list，並帶 reason', async () => {
    vi.mocked(configApi.getBonusConfig).mockResolvedValue({
      data: { after_class_award_unit_price: {}, art_teacher_employee_ids: [] },
    } as never)
    stubAuxApis()
    vi.mocked(configApi.updateBonusConfig).mockResolvedValue({ data: {} } as never)
    // ElMessageBox.prompt 回傳使用者填的原因
    vi.mocked(ElMessageBox.prompt).mockResolvedValue({ value: '年終規則設定調整測試' } as never)

    const wrapper = await mountPanel()
    const vm = wrapper.vm as unknown as PanelVm

    // 模擬使用者編輯
    vm.afterClassAwardRows.push({ className: '美術班', price: 60 })
    vm.afterClassAwardRows.push({ className: '   ', price: 99 }) // 空白班名應略過
    vm.artTeacherEmployeeIds.push(7)
    await nextTick()

    await vm.saveBonusConfig()

    expect(configApi.updateBonusConfig).toHaveBeenCalledTimes(1)
    const payload = vi.mocked(configApi.updateBonusConfig).mock.calls[0][0] as Record<
      string,
      unknown
    >
    expect(payload.after_class_award_unit_price).toEqual({ 美術班: 60 })
    expect(payload.art_teacher_employee_ids).toEqual([7])
    expect(payload.reason).toBe('年終規則設定調整測試')
  })

  it('add / remove afterClassAwardRow', async () => {
    vi.mocked(configApi.getBonusConfig).mockResolvedValue({
      data: { after_class_award_unit_price: { 美術班: 50 } },
    } as never)
    stubAuxApis()

    const wrapper = await mountPanel()
    const vm = wrapper.vm as unknown as PanelVm

    expect(vm.afterClassAwardRows).toHaveLength(1)
    vm.addAfterClassAwardRow()
    expect(vm.afterClassAwardRows).toHaveLength(2)
    vm.removeAfterClassAwardRow(0)
    expect(vm.afterClassAwardRows).toEqual([{ className: '', price: 0 }])
  })
})
