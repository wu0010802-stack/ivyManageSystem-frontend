import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import YearEndConfigView from '../YearEndConfigView.vue'

// ---- Mock API modules ----
vi.mock('@/api/yearEnd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/yearEnd')>()
  return {
    ...actual,
    getOrgSettings: vi.fn(),
    postOrgSettings: vi.fn(),
    getClassTargets: vi.fn(),
    upsertClassTarget: vi.fn(),
  }
})

vi.mock('@/api/employees', () => ({
  getEmployees: vi.fn(),
}))

vi.mock('@/api/classrooms', () => ({
  getClassrooms: vi.fn(),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn().mockResolvedValue('confirm') },
  }
})

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '5' }, query: {} }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}))

vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn().mockReturnValue(true),
}))

import * as yearEndApi from '@/api/yearEnd'
import * as employeesApi from '@/api/employees'
import * as classroomsApi from '@/api/classrooms'
import { ElMessage } from 'element-plus'

// ---- Type helpers ----
type OrgRow = {
  id: number
  year_end_cycle_id: number
  semester_first: boolean
  enrollment_target: number
  enrollment_actual: number | null
  school_achievement_rate: string
  org_achievement_rate: string
  meeting_absence_deduction: string
}

type ClassRow = {
  id: number
  year_end_cycle_id: number
  semester_first: boolean
  classroom_id: number
  head_count_target: number
  head_teacher_employee_id: number | null
  assistant_employee_id: number | null
  returning_student_rate: string
  avg_monthly_enrollment: string
  class_performance_rate: string
}

function makeOrgRow(overrides: Partial<OrgRow> = {}): OrgRow {
  return {
    id: 1,
    year_end_cycle_id: 5,
    semester_first: true,
    enrollment_target: 160,
    enrollment_actual: 150,
    // Percentage form: school_achievement_rate = actual/target × 100 = 93.75
    school_achievement_rate: '93.75',
    // Percentage form: org_achievement_rate = e.g. 83.6 (same unit as importYearEndExcel default)
    org_achievement_rate: '83.6',
    meeting_absence_deduction: '1000',
    ...overrides,
  }
}

function makeClassRow(overrides: Partial<ClassRow> = {}): ClassRow {
  return {
    id: 10,
    year_end_cycle_id: 5,
    semester_first: true,
    classroom_id: 3,
    head_count_target: 25,
    head_teacher_employee_id: 7,
    assistant_employee_id: null,
    returning_student_rate: '0.800',
    avg_monthly_enrollment: '22.5',
    class_performance_rate: '0.900',
    ...overrides,
  }
}

function stubSupportApis() {
  vi.mocked(employeesApi.getEmployees).mockResolvedValue({
    data: [{ id: 7, name: '林老師' }],
  } as never)
  vi.mocked(classroomsApi.getClassrooms).mockResolvedValue({
    data: [{ id: 3, name: '大班A' }],
  } as never)
}

async function mountView() {
  const wrapper = mount(YearEndConfigView, {
    global: {
      stubs: {
        'el-table': true,
        'el-table-column': true,
        'el-button': true,
        'el-card': true,
        'el-alert': true,
        'el-divider': true,
        'el-form': true,
        'el-form-item': true,
        'el-input-number': true,
        'el-select': true,
        'el-option': true,
        'el-tooltip': true,
        'el-icon': true,
        'el-tag': true,
      },
    },
  })
  await nextTick()
  await nextTick()
  return wrapper
}

describe('YearEndConfigView', () => {
  beforeEach(() => vi.clearAllMocks())

  // Case 1: loads org_settings two semesters → vm has 2 rows with enrollment_target
  it('loads org_settings two semesters and exposes them with enrollment_target', async () => {
    vi.mocked(yearEndApi.getOrgSettings).mockResolvedValue({
      data: [
        makeOrgRow({ semester_first: true, enrollment_target: 160 }),
        makeOrgRow({ id: 2, semester_first: false, enrollment_target: 155 }),
      ],
    } as never)
    vi.mocked(yearEndApi.getClassTargets).mockResolvedValue({ data: [] } as never)
    stubSupportApis()

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      orgSettings: OrgRow[]
      orgEdits: Record<string, { enrollment_target: number; meeting_absence_deduction: number }>
      cycleId: number
    }

    expect(vm.orgSettings).toHaveLength(2)
    expect(vm.orgSettings[0].enrollment_target).toBe(160)
    expect(vm.orgSettings[1].enrollment_target).toBe(155)
    // Edit buffers seeded (org_achievement_rate is no longer in edits — it's read-only/echoed from row)
    expect(vm.orgEdits['true'].enrollment_target).toBe(160)
    expect(vm.orgEdits['false'].enrollment_target).toBe(155)
    expect(vm.cycleId).toBe(5)
    expect(yearEndApi.getOrgSettings).toHaveBeenCalledWith(5)
  })

  // Case 2: save org settings → postOrgSettings called with edited enrollment_target
  // and org_achievement_rate echoed from row (not editable — backend computes it)
  it('save org settings calls postOrgSettings with edited enrollment_target and echoed org_achievement_rate', async () => {
    const orgRow = makeOrgRow({ semester_first: true, enrollment_target: 160 })
    // Mock both calls: initial load + reload after save
    vi.mocked(yearEndApi.getOrgSettings)
      .mockResolvedValueOnce({ data: [orgRow] } as never)
      .mockResolvedValueOnce({ data: [{ ...orgRow, enrollment_target: 170 }] } as never)
    vi.mocked(yearEndApi.postOrgSettings).mockResolvedValue({
      data: { ...orgRow, enrollment_target: 170 },
    } as never)
    vi.mocked(yearEndApi.getClassTargets).mockResolvedValue({ data: [] } as never)
    stubSupportApis()

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      orgEdits: Record<string, { enrollment_target: number; meeting_absence_deduction: number }>
      saveOrgSettings: (row: OrgRow) => Promise<void>
      orgSettings: OrgRow[]
    }

    // Edit the target in the buffer
    vm.orgEdits['true'].enrollment_target = 170
    await vm.saveOrgSettings(vm.orgSettings[0])
    await nextTick()

    expect(yearEndApi.postOrgSettings).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        semester_first: true,
        enrollment_target: 170,
        // school_achievement_rate echoed back as number: Number('93.75') = 93.75
        school_achievement_rate: 93.75,
        // org_achievement_rate echoed from row (read-only — backend computes from two school rates)
        org_achievement_rate: 83.6,
      }),
    )
    expect(vi.mocked(ElMessage.success)).toHaveBeenCalledWith(
      expect.stringContaining('上學期'),
    )
  })

  // Case 3: loads class_targets → vm rows present
  it('loads class_targets and exposes them', async () => {
    vi.mocked(yearEndApi.getOrgSettings).mockResolvedValue({ data: [] } as never)
    vi.mocked(yearEndApi.getClassTargets).mockResolvedValue({
      data: [
        makeClassRow({ id: 10, classroom_id: 3, head_count_target: 25 }),
        makeClassRow({ id: 11, semester_first: false, classroom_id: 4, head_count_target: 22 }),
      ],
    } as never)
    stubSupportApis()

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      classTargets: ClassRow[]
      classEdits: Record<number, { head_count_target: number }>
      classroomMap: Record<number, string>
    }

    expect(vm.classTargets).toHaveLength(2)
    expect(vm.classTargets[0].head_count_target).toBe(25)
    // edit buffers seeded
    expect(vm.classEdits[10].head_count_target).toBe(25)
    expect(vm.classEdits[11].head_count_target).toBe(22)
    // classroom name resolved
    expect(vm.classroomMap[3]).toBe('大班A')
    expect(yearEndApi.getClassTargets).toHaveBeenCalledWith(5)
  })

  // Case 4: save a class target → upsertClassTarget called with head_count_target
  it('save class target calls upsertClassTarget with edited head_count_target', async () => {
    const classRow = makeClassRow({ id: 10, classroom_id: 3, head_count_target: 25 })
    vi.mocked(yearEndApi.getOrgSettings).mockResolvedValue({ data: [] } as never)
    vi.mocked(yearEndApi.getClassTargets).mockResolvedValue({
      data: [classRow],
    } as never)
    vi.mocked(yearEndApi.upsertClassTarget).mockResolvedValue({
      data: { ...classRow, head_count_target: 28 },
    } as never)
    stubSupportApis()

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      classEdits: Record<number, { head_count_target: number; head_teacher_employee_id: number | null; returning_student_rate: number; assistant_employee_id: number | null }>
      saveClassTarget: (row: ClassRow) => Promise<void>
      classTargets: ClassRow[]
    }

    // Edit head count in buffer
    vm.classEdits[10].head_count_target = 28
    await vm.saveClassTarget(vm.classTargets[0])
    await nextTick()

    expect(yearEndApi.upsertClassTarget).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        semester_first: true,
        classroom_id: 3,
        head_count_target: 28,
        // assistant echoed back to avoid nulling it
        assistant_employee_id: null,
      }),
    )
    expect(vi.mocked(ElMessage.success)).toHaveBeenCalled()
  })
})
