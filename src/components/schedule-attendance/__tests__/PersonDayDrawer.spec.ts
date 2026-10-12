import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import PersonDayDrawer from '../PersonDayDrawer.vue'
import type { GridCell, GridEmployee } from '@/utils/scheduleAttendanceGrid'
import { cell, day, employee, grid, SHIFTS, W1 } from './gridFixtures'

const api = vi.hoisted(() => ({ confirm: vi.fn(), getDaily: vi.fn(), saveDaily: vi.fn(), deleteDaily: vi.fn() }))
const message = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('@/api/attendanceReconciliation', () => ({ confirmReconciliationShift: api.confirm }))
vi.mock('@/api/shifts', () => ({ getDaily: api.getDaily, saveDaily: api.saveDaily, deleteDaily: api.deleteDaily }))
vi.mock('element-plus', async (orig) => ({ ...(await orig<typeof import('element-plus')>()), ElMessage: message }))

const CALLER = grid().caller

function mountDrawer(target: GridCell, extra: Partial<{ sameDayCells: GridCell[]; caller: typeof CALLER; weeklyShiftId: number | null; employee: GridEmployee }> = {}) {
  return mount(PersonDayDrawer, {
    props: {
      modelValue: true,
      cell: target,
      employee: extra.employee ?? employee(target.employee_id, target.employee_id === 1 ? '林班導' : '王副導'),
      day: day(target.date),
      groupLabel: '滿天星',
      shiftTypes: SHIFTS,
      sameDayCells: extra.sameDayCells ?? [target],
      employeeNames: { 1: '林班導', 2: '王副導' },
      weeklyShiftId: extra.weeklyShiftId ?? 1,
      today: '2026-09-21',
      caller: extra.caller ?? CALLER,
    },
    global: {
      plugins: [ElementPlus],
      stubs: { ElDrawer: { name: 'ElDrawer', props: ['modelValue', 'title'], template: '<section v-if="modelValue"><h2>{{ title }}</h2><slot /></section>' } },
    },
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  api.getDaily.mockResolvedValue({ data: [{ id: 77, employee_id: 1, date: W1, shift_type_id: 2 }] })
  api.saveDaily.mockResolvedValue({ data: {} })
  api.deleteDaily.mockResolvedValue({ data: {} })
  api.confirm.mockResolvedValue({ data: { message: 'ok', updated_count: 1 } })
})

describe('PersonDayDrawer', () => {
  it('標題、應上班與來源鏈（實際生效層加粗）', () => {
    const wrapper = mountDrawer(cell(1, W1, {
      plan: { source: 'rotation', rotation: { rotation_id: 3, school_year: 115, semester: 1, week_label: '05', row_label: '早車' } },
      leaves: [{ leave_id: 1, leave_type_label: '事假', status: 'pending', is_full_day: false, start_time: '13:00', end_time: '17:00' }],
    }))
    expect(wrapper.find('h2').text()).toBe('林班導・滿天星・班導　9/14（一）')
    expect(wrapper.find('[data-test="pdd-plan"]').text()).toBe('早車 07:00–16:30（輪值表）')
    const items = wrapper.findAll('[data-test="pdd-chain"] li')
    expect(items[0].text()).toContain('115 學年上學期・第 05 週・早車')
    expect(items[0].classes()).toContain('pdd__chain-item--active')
    expect(items[1].text()).toContain('早車')
    expect(items.at(-1)!.text()).toContain('事假（13:00–17:00）・待審')
  })

  it('兼兩班：註明另一班；只帶一班不顯示（spec §7）', () => {
    const solo = mountDrawer(cell(1, W1))
    expect(solo.find('[data-test="pdd-other-classes"]').exists()).toBe(false)
    const both = mountDrawer(cell(1, W1), { employee: employee(1, '林班導', { other_classroom_labels: ['向日葵', '小太陽'] }) })
    expect(both.find('[data-test="pdd-other-classes"]').text()).toBe('另兼：向日葵、小太陽')
  })

  it('沒有查看打卡權限：不顯示打卡，也沒有「看他整月」', () => {
    const wrapper = mountDrawer(cell(1, W1), { caller: { ...CALLER, can_view_attendance: false } })
    expect(wrapper.text()).toContain('沒有查看打卡紀錄的權限')
    expect(wrapper.find('[data-test="pdd-records"]').exists()).toBe(false)
  })

  it('改這天：選排休送 day_off；原本是每日調整、改回繼承則刪除該筆', async () => {
    const weekly = mountDrawer(cell(1, W1))
    await flushPromises()
    expect(api.getDaily).not.toHaveBeenCalled()
    const select = weekly.findAllComponents({ name: 'ElSelect' })[0]
    select.vm.$emit('update:modelValue', -1)
    await weekly.vm.$nextTick()
    await weekly.find('[data-test="pdd-day-apply"]').trigger('click')
    await flushPromises()
    expect(api.saveDaily).toHaveBeenCalledWith({ employee_id: 1, date: W1, day_off: true })
    expect(weekly.emitted('changed')).toHaveLength(1)

    const daily = mountDrawer(cell(1, W1, { plan: { source: 'daily', shift_type_id: 2, name: '晚車' } }))
    await flushPromises()
    expect(api.getDaily).toHaveBeenCalledWith({ start_date: W1, end_date: W1, employee_id: 1 })
    daily.findAllComponents({ name: 'ElSelect' })[0].vm.$emit('update:modelValue', -2)
    await daily.vm.$nextTick()
    await daily.find('[data-test="pdd-day-apply"]').trigger('click')
    await flushPromises()
    expect(api.deleteDaily).toHaveBeenCalledWith(77)
  })

  it('確認當日班別：預設帶唯一候選，可一併確認對調者，送出兩筆含各自版本', async () => {
    const me = cell(1, W1, {
      edit: { plan: false, confirm: true, recorded: true, locked_reason: 'recorded' },
      actual: {
        status: 'possible_shift_change', original_shift_type_id: 1, version: 'm'.repeat(64),
        punch_in: `${W1}T08:31:00`, punch_out: `${W1}T18:02:00`,
        candidates: [{ shift_type_id: 2, name: '晚車', work_start: '08:30', work_end: '18:00' }],
      },
    })
    const partner = cell(2, W1, {
      actual: {
        status: 'possible_shift_change', original_shift_type_id: 2, version: 'p'.repeat(64),
        candidates: [{ shift_type_id: 1, name: '早車', work_start: '07:00', work_end: '16:30' }],
      },
    })
    const wrapper = mountDrawer(me, { sameDayCells: [me, partner] })
    await flushPromises()
    expect(wrapper.find('[data-test="pdd-candidates"]').text()).toContain('疑似和 王副導 對調')
    expect(wrapper.find('[data-test="pdd-confirmation"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="pdd-day-select"]').exists()).toBe(false)
    await wrapper.find('[data-test="pdd-pair"] input').setValue(true)
    await wrapper.find('textarea[data-test="pdd-confirm-reason"]').setValue('兩人對調')
    await wrapper.find('[data-test="pdd-confirm-submit"]').trigger('click')
    await flushPromises()
    expect(api.confirm).toHaveBeenCalledWith({
      reason: '兩人對調',
      items: [
        { employee_id: 1, date: W1, shift_type_id: 2, day_off: false, version: 'm'.repeat(64) },
        { employee_id: 2, date: W1, shift_type_id: 1, day_off: false, version: 'p'.repeat(64) },
      ],
    })
    expect(wrapper.emitted('changed')).toHaveLength(1)
  })

  it('本人的已打卡格子：沒有可用動作並說明原因；「看他整月」帶出人與日', async () => {
    const wrapper = mountDrawer(cell(1, W1, {
      actual: {},
      edit: { plan: false, confirm: false, recorded: true, locked_reason: 'self' },
      confirmation: { item_id: 4, round_id: 1, kind: 'swap', status: 'disputed', partner_employee_id: 2 },
    }))
    expect(wrapper.find('[data-test="pdd-confirmation"]').text()).toBe('老師確認：對調・轉行政')
    expect(wrapper.find('[data-test="pdd-locked"]').text()).toBe('本人的出勤不可自行確認')
    await wrapper.find('[data-test="pdd-records"]').trigger('click')
    expect(wrapper.emitted('records')).toEqual([[1, W1]])
  })

  it('沒有任何打卡的人日可帶人員與日期開匯入；有打卡就不出現', async () => {
    const empty = mountDrawer(cell(1, W1, { actual: { status: 'data_incomplete' } }))
    await empty.find('[data-test="pdd-import"]').trigger('click')
    expect(empty.emitted('import')).toEqual([[{ employee_id: 1, employee_name: '林班導', date: W1 }]])
    const punched = mountDrawer(cell(1, W1, { actual: { punch_in: `${W1}T08:00:00` } }))
    expect(punched.find('[data-test="pdd-import"]').exists()).toBe(false)
  })
})
