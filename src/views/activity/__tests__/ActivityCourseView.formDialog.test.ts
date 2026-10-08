import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

// F1 旗艦（spec 2026-09-06 §3.5）：課程對話框改 FormDialog standardNarrow、label-top、
// form-grid 語意配對，必填改 EP rules（不再只靠送出時 toast）。

const getCoursesMock = vi.hoisted(() => vi.fn())
const createCourseMock = vi.hoisted(() => vi.fn())
vi.mock('@/api/activity', () => ({
  getCourses: getCoursesMock,
  getCourseWaitlist: vi.fn(),
  getCourseEnrolled: vi.fn(),
  promoteWaitlist: vi.fn(),
  createCourse: createCourseMock,
  updateCourse: vi.fn(),
  deleteCourse: vi.fn(),
  copyCoursesFromPrevious: vi.fn(),
  sweepExpiredWaitlist: vi.fn(),
  reorderCourses: vi.fn(),
  reorderCourseEnrolled: vi.fn(),
  getCoursePaymentSlipsPdf: vi.fn(),
}))
vi.mock('@/api/employees', () => ({ getEmployees: vi.fn().mockResolvedValue({ data: [] }) }))
vi.mock('@/stores/academicTerm', () => ({ useAcademicTermStore: () => ({ school_year: 114, semester: 1 }) }))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))

import ActivityCourseView from '../ActivityCourseView.vue'

// el-dialog teleport → 就地渲染；重型元件 stub 掉，el-form/el-form-item 用真的以驗 is-required
const STUBS = {
  'el-dialog': { props: ['modelValue', 'width'], template: '<div class="el-dialog-stub" :data-width="width"><slot /><slot name="footer" /></div>' },
  'el-drawer': { template: '<div><slot /></div>' },
  'el-table': { template: '<div><slot /></div>' },
  'el-table-column': { template: '<div />' },
  'el-select': true,
  'el-option': true,
  'el-time-picker': true,
  'el-date-picker': true,
  draggable: { template: '<div><slot /></div>' },
  AcademicTermSelector: { template: '<div />' },
  AdminListToolbar: { template: '<div><slot name="actions" /></div>' },
  AdminListCards: { template: '<div />' },
  CourseDmUploader: { template: '<div />' },
}

interface Vm { openCreate: () => void; openEdit: (row: Record<string, unknown>) => void; dialogVisible: boolean }

async function mountView() {
  // 實際 getCourses 回應為 { data: { courses: [] } }（與同目錄其餘測試一致）；
  // 若餵 { data: [] }，fetchCourses() 對 [].courses 取值會拿到 undefined 並讓
  // 後續 render（courses.length）整棵樹拋錯，連帶讓對話框相關斷言誤判。
  getCoursesMock.mockResolvedValue({ data: { courses: [] } })
  const wrapper = mount(ActivityCourseView, { global: { plugins: [ElementPlus], stubs: STUBS } })
  await flushPromises()
  return wrapper
}

interface CourseFormRef { validate: () => Promise<boolean> }
interface CourseDialogRef { scrollToFirstError: () => boolean }
interface HandleSaveVm { courseFormRef: CourseFormRef; courseDialogRef: CourseDialogRef; handleSave: () => Promise<void> }

describe('ActivityCourseView 課程對話框（FormDialog 旗艦）', () => {
  beforeEach(() => {
    getCoursesMock.mockReset()
    createCourseMock.mockReset()
  })

  it('新增：FormDialog standardNarrow、主鈕「建立課程」、label-top 表單', async () => {
    const w = await mountView()
    ;(w.vm as unknown as Vm).openCreate()
    await flushPromises()
    const dialog = w.find('.ivy-form-dialog--standardNarrow')
    expect(dialog.exists()).toBe(true)
    expect(w.find('.el-dialog-stub').attributes('data-width')).toBe('760px')
    expect(w.find('[data-test="form-dialog-submit"]').text()).toBe('建立課程')
    expect(w.find('form.el-form').classes()).toContain('el-form--label-top')
    expect(w.find('form.el-form').classes()).toContain('form-grid')
  })

  it('必填：課程名稱與價格帶 is-required，其餘不帶', async () => {
    const w = await mountView()
    ;(w.vm as unknown as Vm).openCreate()
    await flushPromises()
    const required = w.findAll('.el-form-item.is-required').map((i) => i.find('.el-form-item__label').text())
    expect(required).toEqual(['課程名稱', '價格（元）'])
  })

  it('編輯：主鈕「儲存」，欄位帶入 row 值', async () => {
    const w = await mountView()
    ;(w.vm as unknown as Vm).openEdit({ id: 7, name: '美語', price: 3000, capacity: 20, allow_waitlist: true })
    await flushPromises()
    expect(w.find('[data-test="form-dialog-submit"]').text()).toBe('儲存')
    expect((w.find('[data-test="course-name-input"] input').element as HTMLInputElement).value).toBe('美語')
  })

  it('版面：名稱 fg-8＋價格 fg-4、說明 fg-12、時段在 FormSection', async () => {
    const w = await mountView()
    ;(w.vm as unknown as Vm).openCreate()
    await flushPromises()
    const cls = (testId: string) => w.find(`[data-test="${testId}"]`).classes()
    expect(cls('course-name-input')).toContain('fg-8')
    expect(cls('course-price-input')).toContain('fg-4')
    expect(cls('course-description-input')).toContain('fg-12')
    expect(w.find('[data-test="section-schedule"] .form-section__label').text()).toContain('上課時段')
  })

  it('驗證失敗擋送出：不呼叫 createCourse，捲到第一個錯誤欄', async () => {
    const w = await mountView()
    ;(w.vm as unknown as Vm).openCreate()
    await flushPromises()
    const vm = w.vm as unknown as HandleSaveVm
    vi.spyOn(vm.courseFormRef, 'validate').mockRejectedValueOnce(new Error('invalid'))
    const scroll = vi.spyOn(vm.courseDialogRef, 'scrollToFirstError')

    await vm.handleSave()

    expect(createCourseMock).not.toHaveBeenCalled()
    expect(scroll).toHaveBeenCalledTimes(1)
  })

  it('驗證通過才送出：createCourse 被呼叫', async () => {
    const w = await mountView()
    ;(w.vm as unknown as Vm).openCreate()
    await flushPromises()
    const vm = w.vm as unknown as HandleSaveVm
    vi.spyOn(vm.courseFormRef, 'validate').mockResolvedValueOnce(true)

    await vm.handleSave()

    expect(createCourseMock).toHaveBeenCalledTimes(1)
  })
})
