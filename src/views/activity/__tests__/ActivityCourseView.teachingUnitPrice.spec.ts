import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import ActivityCourseView from '../ActivityCourseView.vue'

// yhrulea01（義華 2026-10-27）：課程的教課獎勵單價（teaching_unit_price）——
// 每位幼生每計次的教師獎勵金；空白＝沿用年終規則的全域單價，0 是合法值（此課不發）。
// 後端 CourseUpdate 以 exclude_unset 處理，顯式 null 會把欄位清回「沿用全域」，
// 所以編輯時清空必須送 null，不能省略。
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

// 教課獎勵單價與負責老師需金流簽核（ACTIVITY_PAYMENT_APPROVE）；其餘權限一律給
const { permState } = vi.hoisted(() => ({ permState: { approve: true } }))
vi.mock('@/utils/auth', () => ({
  hasPermission: (name: string) => (name === 'ACTIVITY_PAYMENT_APPROVE' ? permState.approve : true),
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
import { ElMessage } from 'element-plus'

const STUBS = {
  AcademicTermSelector: true,
  AdminListToolbar: true,
  'el-table': true,
  'el-table-column': true,
  'el-button': true,
  'el-tag': true,
  'el-icon': true,
  'el-empty': true,
  'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-drawer': true,
  'el-form': { template: '<form><slot /></form>', methods: { validate: () => Promise.resolve(true) } },
  // 表單欄位要渲染 slot，才看得到教課獎勵單價欄與它的說明文字
  'el-form-item': { props: ['label'], template: '<div class="stub-form-item"><label>{{ label }}</label><slot /></div>' },
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
  name: '美術班',
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
  instructor_employee_id: 7 as number | null,
  teaching_unit_price: 60 as number | null,
}

type CourseVm = {
  openCreate: () => void
  openEdit: (row: typeof sampleCourse) => void
  form: { name: string; price: number; teaching_unit_price: number | null }
  handleSave: () => Promise<void>
}

async function mountView() {
  vi.mocked(employeesApi.getEmployees).mockResolvedValue({ data: [{ id: 7, name: '林老師' }] } as never)
  const wrapper = mount(ActivityCourseView, {
    global: { stubs: STUBS, directives: { loading: () => {} } },
  })
  await flushPromises()
  await nextTick()
  return { wrapper, vm: wrapper.vm as unknown as CourseVm }
}

describe('ActivityCourseView — 教課獎勵單價（teaching_unit_price）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    permState.approve = true
    vi.mocked(getCourses).mockResolvedValue({ data: { courses: [sampleCourse] } } as never)
  })

  it('openCreate：預設為 null（沿用全域單價），不是 0', async () => {
    const { vm } = await mountView()

    vm.openCreate()
    await nextTick()

    expect(vm.form.teaching_unit_price).toBeNull()
  })

  it('openEdit：帶入既有課程的單價，包含合法的 0', async () => {
    const { vm } = await mountView()

    vm.openEdit({ ...sampleCourse, teaching_unit_price: 90 })
    await nextTick()
    expect(vm.form.teaching_unit_price).toBe(90)

    vm.openEdit({ ...sampleCourse, teaching_unit_price: 0 })
    await nextTick()
    expect(vm.form.teaching_unit_price).toBe(0)
  })

  it('openEdit：舊後端沒回這個欄位（undefined）→ 視為 null，不是 undefined', async () => {
    const { vm } = await mountView()
    const legacy: Record<string, unknown> = { ...sampleCourse }
    delete legacy.teaching_unit_price

    vm.openEdit(legacy as typeof sampleCourse)
    await nextTick()

    expect(vm.form.teaching_unit_price).toBeNull()
  })

  it('新增課程：payload 帶上單價', async () => {
    vi.mocked(createCourse).mockResolvedValue({ data: { id: 2, message: 'ok', school_year: 114, semester: 1 } } as never)
    const { vm } = await mountView()

    vm.openCreate()
    vm.form.name = '3C3Q'
    vm.form.price = 2000
    vm.form.teaching_unit_price = 65
    await nextTick()
    await vm.handleSave()
    await flushPromises()

    expect(createCourse).toHaveBeenCalledWith(expect.objectContaining({ teaching_unit_price: 65 }))
  })

  it('新增課程：沒填單價時送 null（沿用全域），不是省略也不是 0', async () => {
    vi.mocked(createCourse).mockResolvedValue({ data: { id: 2, message: 'ok', school_year: 114, semester: 1 } } as never)
    const { vm } = await mountView()

    vm.openCreate()
    vm.form.name = '3C3Q'
    vm.form.price = 2000
    await nextTick()
    await vm.handleSave()
    await flushPromises()

    const payload = vi.mocked(createCourse).mock.calls[0][0] as Record<string, unknown>
    expect(payload).toHaveProperty('teaching_unit_price', null)
  })

  it('編輯課程：把單價清空要送 null，後端才會清回沿用全域', async () => {
    vi.mocked(updateCourse).mockResolvedValue({ data: { message: 'ok' } } as never)
    const { vm } = await mountView()

    vm.openEdit(sampleCourse)
    await nextTick()
    vm.form.teaching_unit_price = null
    await nextTick()
    await vm.handleSave()
    await flushPromises()

    const payload = vi.mocked(updateCourse).mock.calls[0][1] as Record<string, unknown>
    expect(payload).toHaveProperty('teaching_unit_price', null)
  })

  it('編輯課程：單價改成 0 就送 0（此課不發），不會被當成空白', async () => {
    vi.mocked(updateCourse).mockResolvedValue({ data: { message: 'ok' } } as never)
    const { vm } = await mountView()

    vm.openEdit(sampleCourse)
    await nextTick()
    vm.form.teaching_unit_price = 0
    await nextTick()
    await vm.handleSave()
    await flushPromises()

    const payload = vi.mocked(updateCourse).mock.calls[0][1] as Record<string, unknown>
    expect(payload).toHaveProperty('teaching_unit_price', 0)
  })

  it('畫面：表單有教課獎勵單價欄，並說明空白＝沿用全域單價', async () => {
    const { wrapper, vm } = await mountView()

    vm.openCreate()
    await nextTick()

    const input = wrapper.find('[data-test="input-teaching-unit-price"]')
    expect(input.exists()).toBe(true)
    const item = input.element.closest('.stub-form-item')
    expect(item?.textContent).toContain('教課獎勵單價')
    expect(item?.textContent).toContain('空白＝沿用')
  })
})

// 審查修補：單價與負責老師直接決定教課獎勵金的金額與收款人，後端建立／變更需金流簽核，
// 沒有簽核權限的人只能看；後端 403 的 detail 要原樣顯示。
describe('ActivityCourseView — 教課獎勵欄位的金流簽核', () => {
  // el-input-number／el-select 在此是 auto-stub：disabled=false 會渲染成 disabled="false"
  const isDisabled = (wrapper: Awaited<ReturnType<typeof mountView>>['wrapper'], dataTest: string) => {
    const attr = wrapper.find(`[data-test="${dataTest}"]`).attributes('disabled')
    return attr !== undefined && attr !== 'false'
  }

  beforeEach(() => {
    vi.clearAllMocks()
    permState.approve = true
    vi.mocked(getCourses).mockResolvedValue({ data: { courses: [sampleCourse] } } as never)
  })

  it('有金流簽核權限：單價與負責老師可編輯，沒有權限提示', async () => {
    const { wrapper, vm } = await mountView()
    vm.openCreate()
    await nextTick()

    expect(isDisabled(wrapper, 'input-teaching-unit-price')).toBe(false)
    expect(isDisabled(wrapper, 'select-instructor-employee')).toBe(false)
    expect(wrapper.find('[data-test="teaching-unit-price-approve-hint"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="teaching-bonus-approve-hint"]').exists()).toBe(false)
  })

  it('沒有金流簽核權限：兩個欄位 disabled，並說明原因與需要的權限', async () => {
    permState.approve = false
    const { wrapper, vm } = await mountView()
    vm.openCreate()
    await nextTick()

    expect(isDisabled(wrapper, 'input-teaching-unit-price')).toBe(true)
    expect(isDisabled(wrapper, 'select-instructor-employee')).toBe(true)
    for (const hint of ['teaching-unit-price-approve-hint', 'teaching-bonus-approve-hint']) {
      const text = wrapper.find(`[data-test="${hint}"]`).text()
      expect(text).toContain('金流簽核')
      expect(text).toContain('ACTIVITY_PAYMENT_APPROVE')
    }
  })

  it('沒有簽核權限仍可編輯其他欄位：整包送回原值（後端值未變不擋）', async () => {
    permState.approve = false
    vi.mocked(updateCourse).mockResolvedValue({ data: { message: 'ok' } } as never)
    const { vm } = await mountView()

    vm.openEdit(sampleCourse)
    await nextTick()
    vm.form.name = '美術班（週三）'
    await vm.handleSave()
    await flushPromises()

    expect(updateCourse).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ name: '美術班（週三）', teaching_unit_price: 60, instructor_employee_id: 7 }),
    )
  })

  it('後端 403（金流簽核）：顯示後端 detail，對話框不關', async () => {
    const detail = '教課教師獎勵金單價會直接影響教課教師獎勵金的金額或收款人，建立或變更需由具備『金流簽核』（ACTIVITY_PAYMENT_APPROVE）權限者執行'
    vi.mocked(updateCourse).mockRejectedValue({ response: { status: 403, data: { detail } } })
    const { vm } = await mountView()

    vm.openEdit(sampleCourse)
    await nextTick()
    vm.form.teaching_unit_price = 99
    await vm.handleSave()
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalledWith(detail)
  })
})
