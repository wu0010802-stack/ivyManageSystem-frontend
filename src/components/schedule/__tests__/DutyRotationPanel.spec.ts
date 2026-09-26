/**
 * 學期輪值表頁籤：無輪值表 → 建立；有 → 儲存送整份覆寫；未儲存時不可套用。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'

const { mockGet, mockCreate, mockReplace, mockImport, mockExport } = vi.hoisted(() => ({
  mockGet: vi.fn(), mockCreate: vi.fn(), mockReplace: vi.fn(), mockImport: vi.fn(), mockExport: vi.fn(),
}))
vi.mock('@/api/dutyRotations', () => ({
  getDutyRotation: mockGet,
  createDutyRotation: mockCreate,
  replaceDutyRotation: mockReplace,
  importDutyRotation: mockImport,
  exportDutyRotation: mockExport,
  applyDutyRotation: vi.fn(),
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))
vi.mock('@/stores/shift', () => ({
  useShiftStore: () => ({
    activeShiftTypes: ref([{ id: 6, name: '早車', work_start: '07:00', work_end: '16:30', is_active: true }]).value,
    fetchShiftTypes: vi.fn(),
  }),
}))
vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({ school_year: 115, semester: 1 }),
}))

import DutyRotationPanel from '../DutyRotationPanel.vue'

// 比照 src/views/__tests__/ScheduleView.test.ts 的 stub 慣例
const globalConfig = {
  stubs: {
    'el-button': {
      props: ['type', 'loading', 'disabled', 'size', 'link'],
      emits: ['click'],
      template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
    },
    'el-select': { props: ['modelValue'], template: '<div class="sel"><slot /></div>' },
    'el-option': { props: ['label', 'value'], template: '<div class="opt">{{ label }}</div>' },
    'el-input': { props: ['modelValue'], template: '<input class="inp" />' },
    'el-alert': { props: ['title', 'type', 'closable'], template: '<div class="alert"><b>{{ title }}</b><slot /></div>' },
    'el-upload': { props: ['onChange', 'autoUpload', 'accept', 'showFileList'], template: '<div class="upload"><slot /></div>' },
    'el-date-picker': { props: ['modelValue'], template: '<input class="dp" />' },
    'el-dialog': { props: ['modelValue', 'title', 'width'], template: '<div v-if="modelValue" class="dlg"><slot /></div>' },
    DutyRotationApplyDialog: { props: ['modelValue', 'rotationId', 'fromWeekStart'], template: '<div class="apply-dlg" />' },
  },
}

const isDisabled = (wrapper: ReturnType<typeof mount>, testId: string) =>
  (wrapper.find(`[data-test="${testId}"]`).element as HTMLButtonElement).disabled

const rotation = {
  id: 7, school_year: 115, semester: 1, name: '115 上教師值勤表',
  default_head_shift_type_id: null, default_assistant_shift_type_id: 6,
  last_applied_at: null, last_applied_by: null,
  rows: [{ id: 11, label: '早車', teacher_role: 'assistant', shift_type_id: 6, sort_order: 0 }],
  weeks: [{ id: 1, week_start_date: '2026-09-14', label: '05' }],
  cells: [{ week_start_date: '2026-09-14', row_id: 11, classroom_id: 101 }],
  issues: [{ code: 'NO_DEFAULT', severity: 'warning', message: '未設定班導未輪值時的班別', week_start_date: null, row_id: null, classroom_id: null, employee_id: null }],
  classrooms: [{ id: 101, name: '滿天星', class_code: '中1', head_teacher_id: null, head_teacher_name: null, assistant_teacher_id: 2, assistant_teacher_name: '王老師' }],
  reapply_hint: { pending: true, from_week_start: '2026-09-21', affected_count: 3 },
}

describe('DutyRotationPanel', () => {
  beforeEach(() => {
    for (const m of [mockGet, mockCreate, mockReplace, mockImport, mockExport]) m.mockReset()
  })

  it('查無輪值表時可建立', async () => {
    mockGet.mockRejectedValueOnce({ response: { status: 404 } })
    mockCreate.mockResolvedValueOnce({ data: rotation })
    const wrapper = mount(DutyRotationPanel, { global: globalConfig })
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith({ school_year: 115, semester: 1 })
    await wrapper.find('[data-test="create"]').trigger('click')
    await flushPromises()
    expect(mockCreate).toHaveBeenCalledWith({ school_year: 115, semester: 1, name: '115 上教師值勤表' })
    expect(wrapper.find('[data-test="grid"]').exists()).toBe(true)
  })

  it('載入後顯示問題與重新套用提示；未修改時儲存停用、套用可用', async () => {
    mockGet.mockResolvedValueOnce({ data: rotation })
    const wrapper = mount(DutyRotationPanel, { global: globalConfig })
    await flushPromises()
    expect(wrapper.find('[data-test="issues"]').text()).toContain('未設定班導未輪值時的班別')
    expect(wrapper.find('[data-test="reapply-hint"]').exists()).toBe(true)
    expect(isDisabled(wrapper, 'save')).toBe(true)
    expect(isDisabled(wrapper, 'apply')).toBe(false)
  })

  it('移除週次後可儲存，送出整份覆寫且套用被停用', async () => {
    mockGet.mockResolvedValueOnce({ data: rotation })
    mockReplace.mockResolvedValueOnce({ data: { ...rotation, weeks: [], cells: [] } })
    const wrapper = mount(DutyRotationPanel, { global: globalConfig })
    await flushPromises()
    await wrapper.find('[data-test="remove-week-2026-09-14"]').trigger('click')
    expect(isDisabled(wrapper, 'apply')).toBe(true)
    expect(isDisabled(wrapper, 'save')).toBe(false)
    await wrapper.find('[data-test="save"]').trigger('click')
    await flushPromises()
    expect(mockReplace).toHaveBeenCalledWith(7, expect.objectContaining({ weeks: [], cells: [] }))
  })
})
