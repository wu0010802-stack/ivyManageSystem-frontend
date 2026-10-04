/**
 * 教師端深度掃描 2026-10-04（F3–F8）回歸測試。
 * 案例源自 .scratch/teacher-audit-20261004/ui-repro.spec.ts，斷言已反轉為「正確行為」。
 * 僅用虛構資料與 API mocks。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { nextTick, type Component } from 'vue'
import ElementPlus from 'element-plus'
import PortalSalaryView from '@/views/portal/PortalSalaryView.vue'
import PortalAttendanceView from '@/views/portal/PortalAttendanceView.vue'
import PortalAttendanceConfirmView from '@/views/portal/PortalAttendanceConfirmView.vue'
import PortalContactBookView from '@/views/portal/PortalContactBookView.vue'
import PortalLeaveForm from '@/components/portal/PortalLeaveForm.vue'
import PortalActivityRollcallView from '@/views/portal/PortalActivityRollcallView.vue'

const mock = vi.hoisted(() => ({
  salary: vi.fn(), sheet: vi.fn(), swapCount: vi.fn(), students: vi.fn(),
  leave: vi.fn(), attachments: vi.fn(), quota: vi.fn(), hours: vi.fn(),
  confirmation: vi.fn(), signoff: vi.fn(), respond: vi.fn(), pending: vi.fn(),
  classDay: vi.fn(), updateEntry: vi.fn(), batchPublish: vi.fn(),
  activitySession: vi.fn(), activitySave: vi.fn(),
  realLeaveCalculator: false,
  route: { query: { year: '2026', month: '9' } as Record<string, string>, params: { sessionId: '101' } },
}))

vi.mock('@/api/portal', () => ({
  getSalaryPreview: mock.salary,
  getAttendanceSheet: mock.sheet,
  getAttendanceSheetPdf: vi.fn(),
  getSwapPendingCount: mock.swapCount,
  getMyStudents: mock.students,
  createMyLeave: mock.leave,
  uploadMyLeaveAttachments: mock.attachments,
  getMyQuotas: mock.quota,
  getMyWorkdayHours: mock.hours,
}))
vi.mock('@/api/portalAttendanceConfirm', () => ({
  getMyAttendanceConfirmations: mock.confirmation,
  respondAttendanceConfirmation: mock.respond,
  signoffAttendanceMonth: mock.signoff,
  getAttendanceConfirmPendingCount: mock.pending,
}))
vi.mock('@/api/contactBook', () => ({
  getClassDay: mock.classDay,
  updateEntry: mock.updateEntry,
  batchPublish: mock.batchPublish,
  batchUpsert: vi.fn(), applyTemplate: vi.fn(), copyFromYesterday: vi.fn(),
  deletePhoto: vi.fn(), publishEntry: vi.fn(), uploadPhoto: vi.fn(),
}))
vi.mock('@/api/activity', () => ({
  getPortalAttendanceSession: mock.activitySession,
  batchUpdatePortalAttendance: mock.activitySave,
}))
vi.mock('@/api/portalLeaveQuotaExpiry', () => ({
  getMyLeaveQuotaExpiry: vi.fn().mockResolvedValue({ data: {} }),
}))
vi.mock('vue-router', () => ({
  useRoute: () => mock.route,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  onBeforeRouteLeave: vi.fn(),
}))
vi.mock('@/utils/auth', () => ({
  getUserInfo: () => ({ id: 1, name: '虛構測試教師', employee_id: 1 }),
}))
vi.mock('@/composables/useIsMobile', async () => {
  const { ref } = await import('vue')
  return { useIsMobile: () => ({ isMobile: ref(false), cleanup: vi.fn() }) }
})
vi.mock('@/composables/useErrorNotify', () => ({
  useErrorNotify: () => ({ notify: vi.fn() }),
}))
vi.mock('@/composables/useContactBookTemplates', () => ({
  useContactBookTemplates: () => ({
    loaded: { value: true }, loading: { value: false }, templates: { value: [] },
    load: vi.fn(), create: vi.fn(), archive: vi.fn(),
  }),
}))
vi.mock('@/composables/useLeaveHoursCalculator', async () => {
  const { ref } = await import('vue')
  const actual = await vi.importActual<typeof import('@/composables/useLeaveHoursCalculator')>(
    '@/composables/useLeaveHoursCalculator',
  )
  return { useLeaveHoursCalculator: (...args: Parameters<typeof actual.useLeaveHoursCalculator>) => {
    // 附件案例隔離無關計算；全天退回案例必須走真計算、配額與日期 watchers。
    if (mock.realLeaveCalculator) return actual.useLeaveHoursCalculator(...args)
    return {
      calcHint: ref(''), calcBreakdown: ref([]), calcLoading: ref(false),
      leaveMode: ref('full'), leaveSingleDate: ref(''),
      quotaInfo: ref(null), quotaLoading: ref(false), quotaExceeded: ref(false),
      calcTooltipHtml: ref(''), officeHoursWarning: ref(''),
      resetCalculatorState: vi.fn(),
    }
  } }
})
vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus')
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
    ElMessageBox: { confirm: vi.fn().mockResolvedValue('confirm') },
  }
})

function deferred<T = unknown>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const wrappers: VueWrapper[] = []
async function page(component: Component, stubs: Record<string, unknown> = {}) {
  const wrapper = shallowMount(component, {
    global: {
      plugins: [ElementPlus],
      renderStubDefaultSlot: true,
      stubs: {
        PortalPageHeader: { template: '<header><slot name="actions" /><slot /></header>' },
        ...stubs,
      },
      directives: { loading: () => {} },
    },
  })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}

function salary(month: number) {
  return { data: {
    year: 2026, month, salary_status: 'finalized', attendance_stats: {},
    salary: {
      income: [{ key: 'base_salary', label: '測試底薪', amount: month * 1000 }],
      deductions: [], separate_transfer: [], income_subtotal: month * 1000,
      deduction_subtotal: 0, separate_subtotal: 0, unused_leave_payout: 0,
      base_transfer_amount: month * 1000,
    },
  } }
}
function sheet(month: number) {
  return { data: { month, employee_name: '虛構測試教師', days: [], summary: {} } }
}
function confirmation(month: number) {
  return { data: {
    year: 2026, month, items: [], pending_count: 0, signed_at: null,
    participant: true, absence_days: [],
  } }
}

beforeEach(() => {
  Object.values(mock).forEach((value) => { if (vi.isMockFunction(value)) value.mockReset() })
  mock.realLeaveCalculator = false
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-04T10:00:00+08:00'))
  mock.route.query = { year: '2026', month: '9' }
  mock.swapCount.mockResolvedValue({ data: { pending_count: 0 } })
  mock.students.mockResolvedValue({ data: { classrooms: [
    { classroom_id: 1, classroom_name: '虛構班級', students: [] },
  ] } })
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.useRealTimers()
})

describe('教師端稽核回歸（F3–F8）', () => {
  it('F7：薪資先前月份的慢回應不得覆蓋目前選取月份', async () => {
    // 正確行為：選九月後，八月慢回應不得覆蓋九月金額。
    mock.salary.mockResolvedValue(salary(10))
    const wrapper = await page(PortalSalaryView)
    const vm = wrapper.vm as unknown as {
      query: { year: number; month: number }
      salaryData: { month: number }
      fetchSalary: () => Promise<void>
    }
    const oldMonth = deferred()
    mock.salary.mockReturnValueOnce(oldMonth.promise).mockResolvedValueOnce(salary(9))
    vm.query.month = 8
    const oldRequest = vm.fetchSalary()
    vm.query.month = 9
    await vm.fetchSalary()
    expect(vm.salaryData.month).toBe(9)
    oldMonth.resolve(salary(8))
    await oldRequest
    await nextTick()
    expect(vm.query.month).toBe(9)
    expect(vm.salaryData.month).toBe(9)
  })

  it('F7：考勤切回月份後不得被前一月在途請求覆蓋', async () => {
    // 正確行為：回到十月快取後，九月請求只可更新九月快取，不能更新十月畫面。
    mock.sheet.mockResolvedValue(sheet(10))
    const wrapper = await page(PortalAttendanceView)
    const vm = wrapper.vm as unknown as {
      query: { year: number; month: number }
      sheetData: { month: number }
      fetchSheet: () => Promise<void>
    }
    const oldMonth = deferred()
    mock.sheet.mockReturnValueOnce(oldMonth.promise)
    vm.query.month = 9
    const oldRequest = vm.fetchSheet()
    vm.query.month = 10
    await vm.fetchSheet()
    expect(vm.sheetData.month).toBe(10)
    oldMonth.resolve(sheet(9))
    await oldRequest
    expect(vm.query.month).toBe(10)
    expect(vm.sheetData.month).toBe(10)
  })

  it('F8：九月簽認回應不得把已切換的八月誤標成完成', async () => {
    // 正確行為：九月 POST 回來後，只能更新九月，八月 signed_at 應仍為 null。
    mock.confirmation.mockResolvedValue(confirmation(9))
    const wrapper = await page(PortalAttendanceConfirmView)
    const vm = wrapper.vm as unknown as {
      month: number; data: { month: number; signed_at: string | null }
      signoff: () => Promise<void>
    }
    const signing = deferred()
    mock.signoff.mockReturnValueOnce(signing.promise)
    const request = vm.signoff()
    expect(mock.signoff).toHaveBeenCalledWith({ year: 2026, month: 9 })
    mock.confirmation.mockResolvedValueOnce(confirmation(8))
    vm.month = 8
    await flushPromises()
    expect(vm.data.month).toBe(8)
    expect(vm.data.signed_at).toBeNull()
    signing.resolve({ data: { year: 2026, month: 9, signed_at: '2026-10-04T10:00:00', round_id: 7 } })
    await request
    await nextTick()
    expect(vm.data.month).toBe(8)
    expect(vm.data.signed_at).toBeNull()
    expect(wrapper.text()).not.toContain('已完成本月出勤確認')
  })

  it('F5：切聯絡簿日期失敗後不得展示可寫的舊日期資料', async () => {
    // 正確行為：新日期讀取失敗後不得展示可寫的舊日期資料。
    const oldEntry = { id: 91, version: 1, log_date: '2026-10-01', teacher_note: '舊日期內容' }
    const oldItem = { student_id: 501, student_name: '虛構學生', entry: oldEntry }
    mock.classDay.mockResolvedValue({ data: {
      items: [oldItem], completion: { roster: 1, draft: 1, published: 0, missing: 0 },
    } })
    mock.route.query.log_date = '2026-10-01'
    const wrapper = await page(PortalContactBookView, {
      ContactBookFilterBar: false, ContactBookEntryCard: false,
    })
    const vm = wrapper.vm as unknown as {
      selectedDate: string; items: typeof oldItem[]; listLoading: boolean
      openDrawer: (item: typeof oldItem) => void
      handleSaveDraft: (payload: Record<string, unknown>, version: number) => Promise<boolean>
    }
    expect(mock.classDay).toHaveBeenLastCalledWith({ classroom_id: 1, log_date: '2026-10-01' })
    mock.classDay.mockRejectedValueOnce(new Error('虛構網路失敗'))
    const filter = wrapper.findComponent({ name: 'ContactBookFilterBar' })
    filter.findComponent({ name: 'ElDatePicker' }).vm.$emit('update:modelValue', '2026-10-02')
    await flushPromises()
    expect(mock.classDay).toHaveBeenLastCalledWith({ classroom_id: 1, log_date: '2026-10-02' })
    expect(vm.listLoading).toBe(false)
    // 新日期讀取失敗：舊日期的列表不得殘留（否則可編輯／儲存到錯的 entry）
    expect(vm.items).toEqual([])
    expect(wrapper.find('.student-card').exists()).toBe(false)
    expect(mock.updateEntry).not.toHaveBeenCalled()
  })

  it('F4：假單已建立但附件失敗，重送只補傳附件不再建立新單', async () => {
    // 正確行為：部分成功後保留 leaveId，重試僅傳附件；不能再次呼叫 create。
    mock.leave.mockResolvedValueOnce({ data: { id: 701 } }).mockResolvedValueOnce({ data: { id: 702 } })
    mock.attachments.mockRejectedValue(new Error('虛構附件網路失敗'))
    // 保留真表單驗證；不可手動寫 template ref，重新渲染會把它換回無 validate 的 stub。
    const wrapper = await page(PortalLeaveForm, { ElForm: false, ElFormItem: false })
    const vm = wrapper.vm as unknown as {
      form: Record<string, unknown>
      formRef: { validate: () => Promise<void> }
      fileList: Array<{ raw: File; name: string; uid: number }>
      submitLoading: boolean
      submitLeave: () => Promise<void>
    }
    Object.assign(vm.form, {
      // 現在固定為 10/4；事假日期須符合真 validator 的至少提前兩日。
      leave_type: 'personal', start_date: '2026-10-07', end_date: '2026-10-07',
      leave_hours: 8, reason: '虛構事由',
    })
    vm.fileList = [{ raw: new File(['synthetic'], 'test.pdf', { type: 'application/pdf' }), name: 'test.pdf', uid: 1 }]
    await nextTick()
    await vm.submitLeave()
    expect(mock.leave).toHaveBeenCalledTimes(1)
    expect(mock.attachments).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('submitted')).toBeUndefined()
    expect(vm.submitLoading).toBe(false)
    // 確認重新渲染後仍呼叫真 validator；不能把 fixture 缺方法誤當產品防重保護。
    expect(typeof vm.formRef.validate).toBe('function')
    await vm.submitLeave()
    // 假單已建立：重送只補傳附件，不得再建立第二張
    expect(mock.leave).toHaveBeenCalledTimes(1)
    expect(mock.attachments.mock.calls.map((args) => args[0])).toEqual([701, 701])
  })

  it('F6：課程點名儲存中再修改，較新輸入仍顯示未存且可重送', async () => {
    // 正確行為：在途期間禁止改輸入，或以送出快照更新基準，讓較新輸入仍顯示未存。
    mock.activitySession.mockResolvedValue({ data: {
      id: 101, course_name: '虛構課程', session_date: '2026-10-04',
      students: [{ registration_id: 11, student_name: '虛構學生', class_name: '虛構班級',
        classroom_id: 1, is_present: null, attendance_notes: '' }],
    } })
    const wrapper = await page(PortalActivityRollcallView, {
      PortalRollcallPanel: false, AttendanceMarkControl: false,
    })
    const vm = wrapper.vm as unknown as {
      drawerSession: { students: Array<{ is_present: boolean | null }> }
      dirtyCount: number; saveLoading: boolean
      handleSave: () => Promise<void>; isDirty: () => boolean
    }
    const mark = wrapper.findComponent({ name: 'AttendanceMarkControl' })
    expect(mark.exists()).toBe(true)
    await mark.get('[data-test="mark-present"]').trigger('click')
    const saving = deferred()
    mock.activitySave.mockReturnValueOnce(saving.promise)
    const request = vm.handleSave()
    await nextTick()
    expect(vm.saveLoading).toBe(true)
    await mark.get('[data-test="mark-absent"]').trigger('click')
    expect(vm.drawerSession.students[0].is_present).toBe(false)
    saving.resolve({ data: { updated: 1, skipped: 0 } })
    await request
    expect(mock.activitySave).toHaveBeenCalledWith(101, [{ registration_id: 11, is_present: true, notes: '' }])
    expect(vm.drawerSession.students[0].is_present).toBe(false)
    // 在途期間的較新輸入（缺席）尚未送出，必須仍為未存，且可再次儲存
    expect(vm.isDirty()).toBe(true)
    expect(vm.dirtyCount).toBe(1)
    mock.activitySave.mockResolvedValueOnce({ data: { updated: 1, skipped: 0 } })
    await vm.handleSave()
    expect(mock.activitySave).toHaveBeenCalledTimes(2)
    expect(mock.activitySave).toHaveBeenLastCalledWith(101, [{ registration_id: 11, is_present: false, notes: '' }])
  })

  it('F3：全天特休工時查詢失敗不得降成 0.5h', async () => {
    // 正確行為：全天查詢失敗應阻擋提交，或至少依全天模式保留合理工時；不可當零長度時段。
    // API mock 只決定網路結果；時數、提示、quotaExceeded 與 ElForm 驗證皆走原始實作。
    mock.realLeaveCalculator = true
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(new Date('2026-10-04T10:00:00+08:00'))
    mock.hours.mockRejectedValue(new Error('虛構排班查詢網路失敗'))
    mock.quota.mockResolvedValue({ data: [{
      leave_type: 'annual', total_hours: 80, used_hours: 0, pending_hours: 0, remaining_hours: 80,
    }] })
    mock.leave.mockResolvedValue({ data: { id: 703 } })
    const wrapper = await page(PortalLeaveForm, { ElForm: false, ElFormItem: false })
    const vm = wrapper.vm as unknown as {
      form: { leave_hours: number }; leaveMode: string; calcLoading: boolean
      quotaExceeded: boolean; calcHint: string
    }
    expect(vm.leaveMode).toBe('full')
    wrapper.findAllComponents({ name: 'ElSelect' })[0].vm.$emit('update:modelValue', 'annual')
    const dates = wrapper.findAllComponents({ name: 'ElDatePicker' })
    expect(dates).toHaveLength(2)
    dates[0].vm.$emit('update:modelValue', '2026-10-07')
    dates[1].vm.$emit('update:modelValue', '2026-10-07')
    await nextTick()
    await vi.advanceTimersByTimeAsync(350)
    await flushPromises()
    expect(mock.hours).toHaveBeenCalledWith({ start_date: '2026-10-07', end_date: '2026-10-07' })
    expect(vm.calcLoading).toBe(false)
    // 全天模式不可把「無時段的同日」當零長度時段而降成 0.5h；改走工作日×8h 的預設班制估算
    expect(vm.form.leave_hours).toBe(8)
    expect(vm.calcHint).not.toContain('同日請假 0.5h')
    expect(vm.quotaExceeded).toBe(false)
    const submit = wrapper.findAllComponents({ name: 'ElButton' }).find((button) => button.text() === '送出申請')!
    submit.vm.$emit('click')
    await flushPromises()
    expect(mock.leave).toHaveBeenCalledWith(expect.objectContaining({
      leave_type: 'annual', start_date: '2026-10-07', end_date: '2026-10-07',
      start_time: null, end_time: null, leave_hours: 8,
    }))
  })
})
