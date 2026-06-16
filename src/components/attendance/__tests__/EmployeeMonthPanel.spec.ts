// src/components/attendance/__tests__/EmployeeMonthPanel.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
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
}) {
  return mount(EmployeeMonthPanel, {
    props: {
      employeeId: overrides.employeeId !== undefined ? overrides.employeeId : 5,
      year: overrides.year ?? 2026,
      month: overrides.month ?? 6,
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

    // Fill in punch time via the time picker
    const timePicker = wrapper.find('.el-time-picker')
    if (timePicker.exists()) {
      await timePicker.setValue('09:00')
      await nextTick()
    }

    const btns = wrapper.findAll('button')
    const punchBtn = btns.find((b) => b.text().includes('補打卡'))
    expect(punchBtn).toBeTruthy()
    await punchBtn!.trigger('click')
    await nextTick()
    await nextTick()

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

    const timePicker = wrapper.find('.el-time-picker')
    if (timePicker.exists()) {
      await timePicker.setValue('09:00')
      await nextTick()
    }

    const btns = wrapper.findAll('button')
    const punchBtn = btns.find((b) => b.text().includes('補打卡'))
    expect(punchBtn).toBeTruthy()
    await punchBtn!.trigger('click')
    await nextTick()
    await nextTick()

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

    const timePicker = wrapper.find('.el-time-picker')
    if (timePicker.exists()) {
      await timePicker.setValue('09:00')
      await nextTick()
    }

    const btns = wrapper.findAll('button')
    const punchBtn = btns.find((b) => b.text().includes('補打卡'))
    if (punchBtn) {
      await punchBtn.trigger('click')
      await nextTick()
      await nextTick()
      expect(mockNotify).toHaveBeenCalled()
    }
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
