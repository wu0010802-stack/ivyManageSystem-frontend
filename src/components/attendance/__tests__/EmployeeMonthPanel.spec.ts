const { mockMonthContext } = vi.hoisted(() => ({ mockMonthContext: vi.fn() }))
vi.mock('@/api/attendanceMonthContext', () => ({ getAttendanceMonthContext: mockMonthContext }))
const { mockCanWrite } = vi.hoisted(() => ({ mockCanWrite: vi.fn(() => true) }))
vi.mock('@/utils/auth', () => ({ hasPermission: mockCanWrite }))
// src/components/attendance/__tests__/EmployeeMonthPanel.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

// ── hoisted mocks (must be defined before vi.mock factories run) ───────────────
const { mockGetRecords, mockUpsertRecord, mockNotify } = vi.hoisted(() => ({
  mockGetRecords: vi.fn(),
  mockUpsertRecord: vi.fn(),
  mockNotify: vi.fn(),
}))

// ── mock api ───────────────────────────────────────────────────────────────────
vi.mock('@/api/attendance', () => ({
  getRecords: mockGetRecords,
  upsertRecord: mockUpsertRecord,
}))

// ── mock useErrorNotify ────────────────────────────────────────────────────────
vi.mock('@/composables/useErrorNotify', () => ({
  useErrorNotify: () => ({ notify: mockNotify }),
}))

// ── mock ElMessage ─────────────────────────────────────────────────────────────
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() },
}))

// Import ElMessage to access the mocked version
import { ElMessage } from 'element-plus'
import EmployeeMonthPanel from '../EmployeeMonthPanel.vue'

// ── fixture data ───────────────────────────────────────────────────────────────
const recordNormal = {
  id: 1,
  employee_id: 5,
  employee_name: '張正常',
  employee_number: 'E001',
  date: '2026-06-02',
  weekday: '二',
  punch_in: '08:00',
  punch_out: '17:00',
  status: 'normal',
  is_late: false,
  is_early_leave: false,
  is_missing_punch_in: false,
  is_missing_punch_out: false,
  late_minutes: 0,
  early_leave_minutes: 0,
  remark: '',
}

const recordMissing = {
  id: 2,
  employee_id: 5,
  employee_name: '張正常',
  employee_number: 'E001',
  date: '2026-06-03',
  weekday: '三',
  punch_in: null,
  punch_out: null,
  status: 'missing_punch',
  is_late: false,
  is_early_leave: false,
  is_missing_punch_in: true,
  is_missing_punch_out: true,
  late_minutes: 0,
  early_leave_minutes: 0,
  remark: '',
}

// ── stubs ──────────────────────────────────────────────────────────────────────
const ElButton = {
  props: ['type', 'disabled', 'size', 'loading'],
  emits: ['click'],
  template: `<button class="el-button" :disabled="disabled" @click="!disabled && $emit('click')"><slot /></button>`,
}

const ElTimePicker = {
  props: ['modelValue', 'format', 'valueFormat', 'placeholder', 'disabled'],
  emits: ['update:modelValue'],
  template: `<input
    class="el-time-picker"
    :value="modelValue ?? ''"
    @input="$emit('update:modelValue', $event.target.value)"
  />`,
}

const EmptyState = {
  props: ['variant', 'title', 'description'],
  template: `<div class="empty-state-stub">{{ title ?? description }}</div>`,
}

const stubs = {
  ElButton,
  ElTimePicker,
  EmptyState,
}

// ── mount helper ───────────────────────────────────────────────────────────────
function mountPanel(overrides: {
  employeeId?: number | null
  year?: number
  month?: number
  revision?: number
}) {
  return mount(EmployeeMonthPanel, {
    props: {
      employeeId: overrides.employeeId !== undefined ? overrides.employeeId : 5,
      year: overrides.year ?? 2026,
      month: overrides.month ?? 6,
      ...(overrides.revision !== undefined ? { revision: overrides.revision } : {}),
    },
    global: {
      stubs,
      directives: {
        loading: { mounted() {}, updated() {} },
      },
    },
  })
}

// ── tests ──────────────────────────────────────────────────────────────────────
describe('EmployeeMonthPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMonthContext.mockResolvedValue({ data: { roster: [], days: [] } })
    mockUpsertRecord.mockResolvedValue({ data: {} })
  })

  // ── API 呼叫 ──────────────────────────────────────────────────────────────────
  it('calls getRecords with employee_id, year, month on mount', async () => {
    mockGetRecords.mockResolvedValue({ data: [recordNormal, recordMissing] })
    mountPanel({})
    await nextTick()
    expect(mockGetRecords).toHaveBeenCalledWith(
      expect.objectContaining({ employee_id: 5, year: 2026, month: 6 }),
    )
  })

  it('does NOT call getRecords when employeeId is null', async () => {
    mountPanel({ employeeId: null })
    await nextTick()
    expect(mockGetRecords).not.toHaveBeenCalled()
  })

  // ── 空 employeeId → 提示訊息 ──────────────────────────────────────────────────
  it('shows 請選擇員工 when employeeId is null', () => {
    const wrapper = mountPanel({ employeeId: null })
    expect(wrapper.text()).toContain('請選擇員工')
  })

  // ── 列表渲染 ────────────────────────────────────────────────────────────────────
  it('renders two rows after load', async () => {
    mockGetRecords.mockResolvedValue({ data: [recordNormal, recordMissing] })
    const wrapper = mountPanel({})
    await nextTick()
    await nextTick()
    const rows = wrapper.findAll('.month-record-row')
    expect(rows.length).toBe(2)
  })

  it('marks anomaly row with anomaly class for missing punch', async () => {
    mockGetRecords.mockResolvedValue({ data: [recordNormal, recordMissing] })
    const wrapper = mountPanel({})
    await nextTick()
    await nextTick()
    const rows = wrapper.findAll('.month-record-row')
    // recordNormal is index 0, recordMissing is index 1
    expect(rows[0].classes()).not.toContain('month-record-row--anomaly')
    expect(rows[1].classes()).toContain('month-record-row--anomaly')
  })

  it('shows date and punch times in each row', async () => {
    mockGetRecords.mockResolvedValue({ data: [recordNormal] })
    const wrapper = mountPanel({})
    await nextTick()
    await nextTick()
    expect(wrapper.text()).toContain('2026-06-02')
    expect(wrapper.text()).toContain('08:00')
    expect(wrapper.text()).toContain('17:00')
  })

  // ── 空記錄 → EmptyState ──────────────────────────────────────────────────────
  it('shows empty state when no records', async () => {
    mockGetRecords.mockResolvedValue({ data: [] })
    const wrapper = mountPanel({})
    await nextTick()
    await nextTick()
    expect(wrapper.find('.empty-state-stub').exists()).toBe(true)
  })

  // ── 主路徑：Array.isArray guard（真實後端 shape）────────────────────────────
  it('handles array response (real backend shape) from getRecords', async () => {
    mockGetRecords.mockResolvedValue({ data: [recordNormal] })
    const wrapper = mountPanel({})
    await nextTick()
    await nextTick()
    const rows = wrapper.findAll('.month-record-row')
    expect(rows.length).toBe(1)
    expect(wrapper.text()).toContain('2026-06-02')
  })

  // ── 補打卡 ────────────────────────────────────────────────────────────────────
  it('calls upsertRecord when 補打卡 button clicked on a missing-punch row', async () => {
    mockGetRecords.mockResolvedValue({ data: [recordMissing] })
    const wrapper = mountPanel({})
    await nextTick()
    await nextTick()

    await wrapper.findAll('button').find(button => button.text() === '補打卡')!.trigger('click')
    await wrapper.find('.el-time-picker').setValue('09:00')
    await wrapper.findAll('button').find(button => button.text() === '儲存補卡')!.trigger('click')
    await flushPromises()

    expect(mockUpsertRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        employee_id: 5,
        date: recordMissing.date,
      }),
    )
  })

  it('emits updated and calls ElMessage.success on successful upsert', async () => {
    mockGetRecords.mockResolvedValue({ data: [recordMissing] })
    const wrapper = mountPanel({})
    await nextTick()
    await nextTick()

    await wrapper.findAll('button').find(button => button.text() === '補打卡')!.trigger('click')
    await wrapper.find('.el-time-picker').setValue('09:00')
    await wrapper.findAll('button').find(button => button.text() === '儲存補卡')!.trigger('click')
    await flushPromises()

    expect(ElMessage.success as ReturnType<typeof vi.fn>).toHaveBeenCalled()
    expect(wrapper.emitted('updated')).toBeTruthy()
  })

  it('calls notify on upsert failure', async () => {
    mockGetRecords.mockResolvedValue({ data: [recordMissing] })
    const err = new Error('upsert failed')
    mockUpsertRecord.mockRejectedValueOnce(err)
    const wrapper = mountPanel({})
    await nextTick()
    await nextTick()

    await wrapper.findAll('button').find(button => button.text() === '補打卡')!.trigger('click')
    await wrapper.find('.el-time-picker').setValue('09:00')
    await wrapper.findAll('button').find(button => button.text() === '儲存補卡')!.trigger('click')
    await flushPromises()
    expect(mockNotify).toHaveBeenCalled()

  })

  // ── watch: props 改變重新載入 ───────────────────────────────────────────────
  it('reloads when year/month props change', async () => {
    mockGetRecords.mockResolvedValue({ data: [] })
    const wrapper = mountPanel({})
    await nextTick()
    expect(mockGetRecords).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ year: 2026, month: 7 })
    await nextTick()
    expect(mockGetRecords).toHaveBeenCalledTimes(2)
    expect(mockGetRecords).toHaveBeenLastCalledWith(
      expect.objectContaining({ month: 7 }),
    )
  })
})


describe('核對日期定位', () => {
  it('定位指定日期，該日無紀錄時明確說明', async () => {
    mockGetRecords.mockResolvedValue({ data: [recordNormal, recordMissing] })
    const wrapper = mountPanel({})
    await wrapper.setProps({ focusDate: '2026-06-03' })
    await flushPromises()
    expect(wrapper.find('[data-attendance-date="2026-06-03"]').attributes('aria-current')).toBe('date')
    await wrapper.setProps({ focusDate: '2026-06-04' })
    expect(wrapper.text()).toContain('2026-06-04 尚無打卡紀錄')
    wrapper.unmount()
  })
  it('快速切換人員時，舊請求不得覆蓋新目標紀錄', async () => {
    let release!: (value: unknown) => void
    mockGetRecords.mockReturnValueOnce(new Promise(resolve => { release = resolve }))
    const wrapper = mountPanel({ employeeId: 5 })
    mockGetRecords.mockResolvedValueOnce({ data: [{ ...recordNormal, employee_id: 6, date: '2026-06-04' }] })
    await wrapper.setProps({ employeeId: 6, focusDate: '2026-06-04' })
    await flushPromises()
    release({ data: [recordNormal] })
    await flushPromises()
    expect(wrapper.find('[data-attendance-date="2026-06-04"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('2026-06-02')
    wrapper.unmount()
  })
})


it('沒有Attendance列仍依已結束班表顯示缺卡日，不直接攤開補卡欄位', async () => {
  mockGetRecords.mockResolvedValue({ data: [] })
  mockMonthContext.mockResolvedValue({ data: { roster: [], days: [{ date: '2026-06-03', is_expected_workday: true, schedule_known: true, expected_start_at: '2026-06-03T08:00:00+08:00', expected_end_at: '2026-06-03T17:00:00+08:00', full_day_leave: false, approved_leaves: [] }] } })
  const wrapper = mountPanel({})
  await flushPromises()
  expect(wrapper.find('[data-attendance-date="2026-06-03"]').exists()).toBe(true)
  expect(wrapper.text()).toContain('缺卡待確認')
  expect(wrapper.find('.el-time-picker').exists()).toBe(false)
  wrapper.unmount()
})


it('兩張卡都有的遲到紀錄仍可更正時間，未修改不得送出', async () => {
  mockMonthContext.mockResolvedValue({ data: { roster: [], days: [] } })
  mockGetRecords.mockResolvedValue({ data: [{ ...recordNormal, is_late: true, punch_in: '09:00' }] })
  mockUpsertRecord.mockClear()
  const wrapper = mountPanel({})
  await flushPromises()
  await wrapper.findAll('button').find(button => button.text() === '補打卡')!.trigger('click')
  const save = wrapper.findAll('button').find(button => button.text() === '儲存補卡')!
  expect(save.attributes('disabled')).toBeDefined()
  await wrapper.find('.el-time-picker').setValue('08:00')
  await save.trigger('click')
  await flushPromises()
  expect(mockUpsertRecord).toHaveBeenCalledWith({ employee_id: 5, date: '2026-06-02', punch_in: '08:00', punch_out: '17:00' })
  wrapper.unmount()
})

it('班表載入失敗不得合成缺卡，提供重新載入', async () => {
  mockGetRecords.mockResolvedValue({ data: [] })
  mockMonthContext.mockRejectedValueOnce(new Error('context unavailable'))
  const wrapper = mountPanel({})
  await flushPromises()
  expect(wrapper.find('[role="alert"]').text()).toContain('無法判定缺卡')
  expect(wrapper.findAll('.month-record-row')).toHaveLength(0)
  expect(wrapper.text()).toContain('重新載入')
  wrapper.unmount()
})

it('補卡送出後切換員工，舊儲存完成不重載或覆蓋新員工', async () => {
  let release!: () => void
  mockMonthContext.mockResolvedValue({ data: { roster: [], days: [] } })
  mockGetRecords.mockResolvedValue({ data: [recordMissing] })
  mockUpsertRecord.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve }))
  const wrapper = mountPanel({})
  await flushPromises()
  await wrapper.findAll('button').find(button => button.text() === '補打卡')!.trigger('click')
  const save = wrapper.findAll('button').find(button => button.text() === '儲存補卡')!
  expect(save.attributes('disabled')).toBeDefined()
  await wrapper.find('.el-time-picker').setValue('08:00')
  await save.trigger('click')
  expect(mockUpsertRecord).toHaveBeenLastCalledWith({ employee_id: 5, date: '2026-06-03', punch_in: '08:00' })
  mockGetRecords.mockResolvedValue({ data: [{ ...recordNormal, employee_id: 6 }] })
  await wrapper.setProps({ employeeId: 6 })
  await flushPromises()
  const requests = mockGetRecords.mock.calls.length
  release()
  await flushPromises()
  expect(mockGetRecords).toHaveBeenCalledTimes(requests)
  expect(wrapper.text()).toContain('2026-06-02')
  expect(wrapper.text()).not.toContain('2026-06-03')
  wrapper.unmount()
})


it('唯讀使用者看得到缺卡但不能開補卡表單', async () => {
  mockCanWrite.mockReturnValueOnce(false)
  mockMonthContext.mockResolvedValue({ data: { roster: [], days: [] } })
  mockGetRecords.mockResolvedValue({ data: [recordMissing] })
  const wrapper = mountPanel({})
  await flushPromises()
  expect(wrapper.text()).toContain('缺卡待確認')
  expect(wrapper.findAll('button').some(button => button.text() === '補打卡')).toBe(false)
  wrapper.unmount()
})

it('點補卡後表單捲入畫面並聚焦時間欄位', async () => {
  mockMonthContext.mockResolvedValue({ data: { roster: [], days: [] } })
  mockGetRecords.mockResolvedValue({ data: [recordMissing] })
  const scroll = vi.fn()
  const previousScroll = HTMLElement.prototype.scrollIntoView
  HTMLElement.prototype.scrollIntoView = scroll
  const wrapper = mount(EmployeeMonthPanel, { props: { employeeId: 5, year: 2026, month: 6 }, attachTo: document.body, global: { stubs, directives: { loading: {} } } })
  await flushPromises()
  await wrapper.findAll('button').find(button => button.text() === '補打卡')!.trigger('click')
  await flushPromises()
  expect(scroll).toHaveBeenCalledWith({ block: 'center' })
  expect(document.activeElement).toBe(wrapper.find('.el-time-picker').element)
  wrapper.unmount()
  HTMLElement.prototype.scrollIntoView = previousScroll
})


describe('整月明細在匯入後重新載入', () => {
  it('revision 遞增即重抓（同員工同月匯入時 employeeId/year/month 都沒變）', async () => {
    const wrapper = mountPanel({ revision: 0 })
    await flushPromises()
    const before = mockGetRecords.mock.calls.length
    expect(before).toBeGreaterThan(0)

    await wrapper.setProps({ revision: 1 })
    await flushPromises()
    // 少了這條，匯入完成後回到整月明細仍顯示匯入前的缺卡與舊時間
    expect(mockGetRecords.mock.calls.length).toBe(before + 1)
    wrapper.unmount()
  })

  it('revision 沒變則不重抓，避免無謂請求', async () => {
    const wrapper = mountPanel({ revision: 3 })
    await flushPromises()
    const before = mockGetRecords.mock.calls.length

    await wrapper.setProps({ revision: 3 })
    await flushPromises()
    expect(mockGetRecords.mock.calls.length).toBe(before)
    wrapper.unmount()
  })
})

// ── 月合計列 ──────────────────────────────────────────────────────────────────
// 次數以 is_late / is_early_leave 旗標為準（與後端扣款判定同口徑），分鐘數取
// late_minutes / early_leave_minutes。缺卡列的狀態文字會蓋過「遲到」，但分鐘數仍
// 須計入合計，否則合計數字在明細表上數不出來。
const makeRecord = (overrides: Record<string, unknown>) => ({
  ...recordNormal, ...overrides,
})

describe('月合計列', () => {
  it('依旗標統計次數與總分鐘，超過一小時改寫成時分', async () => {
    mockGetRecords.mockResolvedValue({ data: [
      makeRecord({ id: 11, date: '2026-06-02', punch_in: '08:12', status: 'late', is_late: true, late_minutes: 12 }),
      makeRecord({ id: 12, date: '2026-06-04', punch_in: '08:50', status: 'late', is_late: true, late_minutes: 50 }),
      makeRecord({ id: 13, date: '2026-06-05', punch_out: '16:40', status: 'early_leave', is_early_leave: true, early_leave_minutes: 20 }),
      makeRecord({ id: 14, date: '2026-06-09' }),
    ] })
    const wrapper = mountPanel({})
    await flushPromises()

    const total = wrapper.find('.month-record-total')
    expect(total.exists()).toBe(true)
    expect(total.text()).toContain('本月合計')
    expect(total.text()).toContain('遲到 2 次')
    expect(total.text()).toContain('1 小時 2 分鐘')
    expect(total.text()).toContain('早退 1 次')
    expect(total.text()).toContain('20 分鐘')
    wrapper.unmount()
  })

  it('缺卡列的遲到也計入，且逐列標出分鐘數讓合計可核對', async () => {
    mockGetRecords.mockResolvedValue({ data: [
      makeRecord({ id: 21, date: '2026-06-02', punch_in: '08:12', status: 'late', is_late: true, late_minutes: 12 }),
      // 只打上班卡又遲到：狀態顯示「缺卡待確認」，但資料上 is_late 為真
      makeRecord({ id: 22, date: '2026-06-03', punch_in: '08:08', punch_out: null, status: 'missing_punch', is_late: true, is_missing_punch_out: true, late_minutes: 8 }),
    ] })
    const wrapper = mountPanel({})
    await flushPromises()

    const total = wrapper.find('.month-record-total')
    expect(total.text()).toContain('遲到 2 次')
    expect(total.text()).toContain('20 分鐘')
    // 對帳：合計說 2 次，明細表上就要看得到 2 列標了遲到分鐘
    const statuses = wrapper.findAll('.month-record-row__status').map(cell => cell.text())
    expect(statuses.filter(text => /12 分鐘|遲到 8 分/.test(text)).length).toBe(2)
    wrapper.unmount()
  })

  it('整月沒有遲到早退時明說，不顯示 0 次 0 分', async () => {
    mockGetRecords.mockResolvedValue({ data: [recordNormal, recordMissing] })
    const wrapper = mountPanel({})
    await flushPromises()

    const total = wrapper.find('.month-record-total')
    expect(total.text()).toContain('本月無遲到、早退')
    expect(total.text()).not.toContain('0 次')
    wrapper.unmount()
  })

  it('旗標為 false 的殘留分鐘數不計入', async () => {
    mockGetRecords.mockResolvedValue({ data: [
      makeRecord({ id: 31, date: '2026-06-02', late_minutes: 30, early_leave_minutes: 15 }),
    ] })
    const wrapper = mountPanel({})
    await flushPromises()

    expect(wrapper.find('.month-record-total').text()).toContain('本月無遲到、早退')
    wrapper.unmount()
  })

  it('沒有任何列時不渲染合計列', async () => {
    mockGetRecords.mockResolvedValue({ data: [] })
    const wrapper = mountPanel({})
    await flushPromises()

    expect(wrapper.find('.month-record-total').exists()).toBe(false)
    wrapper.unmount()
  })
})
