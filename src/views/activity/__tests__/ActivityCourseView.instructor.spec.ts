import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import ActivityCourseView from '../ActivityCourseView.vue'

// G8（年終批次2）：課程負責老師（instructor_employee_id）——年終教課獎勵金依此歸屬自動計算。
// 只 mock 用得到的 exports，其餘（copyCoursesFromPrevious 等）走 actual 保留現狀行為。
vi.mock('@/api/activity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/activity')>()
  return {
    ...actual,
    getCourses: vi.fn(),
    createCourse: vi.fn(),
    updateCourse: vi.fn(),
  }
})

vi.mock('@/api/employees', () => ({
  getEmployees: vi.fn(),
}))

vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({ school_year: 114, semester: 1 }),
}))

vi.mock('@/utils/auth', () => ({
  hasPermission: () => true,
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn() },
  }
})

import { getCourses, createCourse, updateCourse } from '@/api/activity'
import * as employeesApi from '@/api/employees'

const STUBS = {
  'AcademicTermSelector': true,
  'el-table': true,
  'el-table-column': true,
  'el-button': true,
  'el-tag': true,
  'el-icon': true,
  'el-empty': true,
  'el-dialog': true,
  'el-drawer': true,
  'el-form': true,
  'el-form-item': true,
  'el-input': true,
  'el-input-number': true,
  'el-select': true,
  'el-option': true,
  'el-switch': true,
  'el-time-picker': true,
  'el-divider': true,
  'el-alert': true,
  'el-radio-group': true,
  'el-radio': true,
}

const sampleCourse = {
  id: 1,
  name: '音樂律動',
  price: 3000,
  sessions: 10,
  capacity: 20,
  enrolled: 5,
  promoted_pending: 0,
  waitlist_count: 0,
  allow_waitlist: true,
  video_url: '',
  description: '',
  min_age_months: null,
  max_age_months: null,
  meeting_weekday: null,
  meeting_start_time: '',
  meeting_end_time: '',
  instructor_name: '',
  instructor_employee_id: null as number | null,
}

function stubEmployees() {
  vi.mocked(employeesApi.getEmployees).mockResolvedValue({
    data: [
      { id: 7, name: '林老師' },
      { id: 9, name: '王老師' },
    ],
  } as never)
}

async function mountView() {
  const wrapper = mount(ActivityCourseView, {
    global: {
      stubs: STUBS,
      directives: { loading: () => {} },
    },
  })
  await flushPromises()
  await nextTick()
  return wrapper
}

describe('ActivityCourseView — G8 課程負責老師選擇器', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mount 時載入在職員工清單', async () => {
    vi.mocked(getCourses).mockResolvedValue({ data: { courses: [] } } as never)
    stubEmployees()

    await mountView()

    expect(employeesApi.getEmployees).toHaveBeenCalledWith(
      expect.objectContaining({ is_active: true }),
    )
  })

  it('列表：instructor_employee_id 對應到員工姓名，找不到對應員工清單則顯示「未設定」', async () => {
    vi.mocked(getCourses).mockResolvedValue({
      data: { courses: [{ ...sampleCourse, instructor_employee_id: 7 }] },
    } as never)
    stubEmployees()

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      instructorName: (row: { instructor_employee_id?: number | null }) => string
    }

    expect(vm.instructorName({ instructor_employee_id: 7 })).toBe('林老師')
  })

  it('列表：instructor_employee_id 為 null 時 instructorName 回空字串（模板顯示「未設定」）', async () => {
    vi.mocked(getCourses).mockResolvedValue({
      data: { courses: [{ ...sampleCourse, instructor_employee_id: null }] },
    } as never)
    stubEmployees()

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      instructorName: (row: { instructor_employee_id?: number | null }) => string
    }

    expect(vm.instructorName({ instructor_employee_id: null })).toBe('')
  })

  it('openEdit：帶入既有 row 的 instructor_employee_id 到表單', async () => {
    vi.mocked(getCourses).mockResolvedValue({
      data: { courses: [{ ...sampleCourse, instructor_employee_id: 9 }] },
    } as never)
    stubEmployees()

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      openEdit: (row: typeof sampleCourse) => void
      form: { instructor_employee_id: number | null }
    }

    vm.openEdit({ ...sampleCourse, instructor_employee_id: 9 })
    await nextTick()

    expect(vm.form.instructor_employee_id).toBe(9)
  })

  it('openCreate：預設 instructor_employee_id 為 null', async () => {
    vi.mocked(getCourses).mockResolvedValue({ data: { courses: [] } } as never)
    stubEmployees()

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      openCreate: () => void
      form: { instructor_employee_id: number | null }
    }

    vm.openCreate()
    await nextTick()

    expect(vm.form.instructor_employee_id).toBeNull()
  })

  it('新增課程：handleSave payload 帶上 instructor_employee_id', async () => {
    vi.mocked(getCourses).mockResolvedValue({ data: { courses: [] } } as never)
    stubEmployees()
    vi.mocked(createCourse).mockResolvedValue({ data: { id: 1, message: 'ok', school_year: 114, semester: 1 } } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      openCreate: () => void
      form: { name: string; price: number; instructor_employee_id: number | null }
      handleSave: () => Promise<void>
    }

    vm.openCreate()
    vm.form.name = '美術班'
    vm.form.price = 2000
    vm.form.instructor_employee_id = 7
    await nextTick()

    await vm.handleSave()
    await flushPromises()

    expect(createCourse).toHaveBeenCalledWith(
      expect.objectContaining({ instructor_employee_id: 7 }),
    )
  })

  it('編輯課程：handleSave payload 帶上 instructor_employee_id（含清空為 null）', async () => {
    vi.mocked(getCourses).mockResolvedValue({
      data: { courses: [{ ...sampleCourse, instructor_employee_id: 7 }] },
    } as never)
    stubEmployees()
    vi.mocked(updateCourse).mockResolvedValue({ data: { message: 'ok' } } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      openEdit: (row: typeof sampleCourse) => void
      form: { instructor_employee_id: number | null }
      handleSave: () => Promise<void>
    }

    vm.openEdit({ ...sampleCourse, instructor_employee_id: 7 })
    await nextTick()
    // 使用者清空負責老師
    vm.form.instructor_employee_id = null
    await nextTick()

    await vm.handleSave()
    await flushPromises()

    expect(updateCourse).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ instructor_employee_id: null }),
    )
  })
})
