import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import ActivityCourseView from '../ActivityCourseView.vue'

// 可報名年級（allowed_grades，2026-07-31）：課程表單可勾幼幼班/小班/中班/大班，
// 空勾選送 null（後端正規化為 NULL=不限）。僅顯示 advisory，不擋報名。
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
  getEmployees: vi.fn().mockResolvedValue({ data: [] }),
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

const STUBS = {
  'AcademicTermSelector': true,
  'AdminListToolbar': true,
  'el-table': true,
  'el-table-column': true,
  'el-button': true,
  'el-tag': true,
  'el-icon': true,
  'el-empty': true,
  // el-dialog 原為 auto-stub（true）：VTU 的 true stub 不渲染 default slot，導致
  // FormDialog 內的 el-form 從未掛載、courseFormRef.value 恆為 undefined（handleSave
  // 改 fail-closed 後因此誤擋）。改成保留 slot 的樣板（與 ActivityCreateTerm.test.ts 同）
  'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-drawer': true,
  // handleSave 改 fail-closed 後會呼叫 courseFormRef.value.validate()：補一個恆回
  // Promise.resolve(true) 的版本讓既有測試繞過表單驗證
  'el-form': { template: '<form><slot /></form>', methods: { validate: () => Promise.resolve(true) } },
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
  'el-checkbox-group': true,
  'el-checkbox': true,
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
  meeting_weekdays: null,
  meeting_start_time: '',
  meeting_end_time: '',
  instructor_name: '',
  instructor_employee_id: null as number | null,
  allowed_grades: [] as string[],
}

type Vm = {
  openEdit: (row: typeof sampleCourse) => void
  openCreate: () => void
  handleSave: () => Promise<void>
  form: { name: string; price: number; allowed_grades: string[] }
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

describe('ActivityCourseView — 可報名年級（allowed_grades）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getCourses).mockResolvedValue({ data: { courses: [] } } as never)
  })

  it('openEdit 以列資料填入 allowed_grades（淺複製，不共用參照）', async () => {
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as Vm
    const row = { ...sampleCourse, allowed_grades: ['中班', '大班'] }

    vm.openEdit(row)

    expect(vm.form.allowed_grades).toEqual(['中班', '大班'])
    vm.form.allowed_grades.push('小班')
    expect(row.allowed_grades).toEqual(['中班', '大班'])
  })

  it('編輯儲存：勾選的年級隨 payload 送出', async () => {
    vi.mocked(updateCourse).mockResolvedValue({ data: {} } as never)
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as Vm

    vm.openEdit({ ...sampleCourse, allowed_grades: ['幼幼班'] })
    await vm.handleSave()

    expect(updateCourse).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ allowed_grades: ['幼幼班'] }),
    )
  })

  it('新增儲存：未勾任何年級送 null（後端正規化為 NULL=不限）', async () => {
    vi.mocked(createCourse).mockResolvedValue({ data: {} } as never)
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as Vm

    vm.openCreate()
    vm.form.name = '直排輪'
    vm.form.price = 1200
    await vm.handleSave()

    expect(createCourse).toHaveBeenCalledWith(
      expect.objectContaining({ allowed_grades: null }),
    )
  })
})
