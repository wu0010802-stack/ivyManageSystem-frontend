import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import PersonDayDrawer from '../PersonDayDrawer.vue'
import type { GridCell, GridEmployee } from '@/utils/scheduleAttendanceGrid'
import { cell, day, employee, grid, SHIFTS, W1 } from './gridFixtures'

const api = vi.hoisted(() => ({ confirm: vi.fn(), getDaily: vi.fn(), saveDaily: vi.fn(), deleteDaily: vi.fn() }))
const message = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }))
vi.mock('@/api/attendanceReconciliation', () => ({ confirmReconciliationShift: api.confirm }))
vi.mock('@/api/shifts', () => ({ getDaily: api.getDaily, saveDaily: api.saveDaily, deleteDaily: api.deleteDaily }))
const box = vi.hoisted(() => ({ confirm: vi.fn() }))
vi.mock('element-plus', async (orig) => ({ ...(await orig<typeof import('element-plus')>()), ElMessage: message, ElMessageBox: box }))

const CALLER = grid().caller

function mountDrawer(target: GridCell, extra: Partial<{ sameDayCells: GridCell[]; caller: typeof CALLER; weeklyShiftId: number | null; employee: GridEmployee; importCovered: boolean }> = {}) {
  return mount(PersonDayDrawer, {
    props: {
      modelValue: true,
      cell: target,
      employee: extra.employee ?? employee(target.employee_id, target.employee_id === 1 ? '林班導' : '王副導'),
      day: day(target.date, { import_covered: extra.importCovered ?? true }),
      groupLabel: '滿天星',
      shiftTypes: SHIFTS,
      sameDayCells: extra.sameDayCells ?? [target],
      employeeNames: { 1: '林班導', 2: '王副導' },
      weeklyShiftId: 'weeklyShiftId' in extra ? extra.weeklyShiftId! : 1,
      today: '2026-09-21',
      caller: extra.caller ?? CALLER,
    },
    global: {
      plugins: [ElementPlus],
      stubs: {
        // 「關閉」鈕模擬 X／Esc／點遮罩：有 before-close 就交給它決定要不要關
        ElDrawer: {
          name: 'ElDrawer',
          props: ['modelValue', 'title', 'beforeClose'],
          emits: ['update:modelValue'],
          template: '<section v-if="modelValue"><h2>{{ title }}</h2><button type="button" data-test="stub-drawer-close" @click="close" /><slot /></section>',
          methods: {
            close(this: { beforeClose?: (done: () => void) => void; $emit: (e: string, v: boolean) => void }) {
              const done = () => this.$emit('update:modelValue', false)
              if (this.beforeClose) this.beforeClose(done)
              else done()
            },
          },
        },
      },
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

  it('沒有 SCHEDULE（週排班取不到，weeklyShiftId 為 null）：來源為週排班／輪值表時，週排班層用格子計畫的班別名，不寫「無」', () => {
    const weekly = mountDrawer(
      cell(1, W1, { plan: { source: 'weekly' }, actual: {}, edit: { plan: false, locked_reason: 'no_permission' } }),
      { weeklyShiftId: null, caller: { ...CALLER, can_edit_plan: false } },
    )
    const weeklyItem = weekly.findAll('[data-test="pdd-chain"] li')[1]
    expect(weeklyItem.classes()).toContain('pdd__chain-item--active')
    expect(weeklyItem.text()).toBe('週排班早車')

    const rotation = mountDrawer(
      cell(1, W1, {
        plan: { source: 'rotation', rotation: { rotation_id: 3, school_year: 115, semester: 1, week_label: '05', row_label: '早車' } },
        actual: {},
        edit: { plan: false, locked_reason: 'no_permission' },
      }),
      { weeklyShiftId: null, caller: { ...CALLER, can_edit_plan: false } },
    )
    expect(rotation.findAll('[data-test="pdd-chain"] li')[1].text()).toBe('週排班早車')
  })

  it('週排班層：來源不是週排班／輪值表且 weeklyShiftId 為 null 時仍寫「無」', () => {
    const wrapper = mountDrawer(
      cell(1, W1, { plan: { source: 'daily', shift_type_id: 2, name: '晚車' }, actual: {} }),
      { weeklyShiftId: null },
    )
    expect(wrapper.findAll('[data-test="pdd-chain"] li')[1].text()).toBe('週排班無')
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

  describe('打到一半的確認原因不會無聲消失', () => {
    const confirmable = () => cell(1, W1, {
      edit: { plan: false, confirm: true, recorded: true, locked_reason: 'recorded' },
      actual: { status: 'missing_punch', version: 'v'.repeat(64), punch_in: `${W1}T07:52:00`, punch_out: null },
    })

    it('原因有字時關抽屜要先確認；取消就留著，確認才關', async () => {
      const wrapper = mountDrawer(confirmable())
      await flushPromises()
      await wrapper.find('[data-test="stub-drawer-close"]').trigger('click')
      await flushPromises()
      expect(box.confirm).not.toHaveBeenCalled()
      expect(wrapper.emitted('update:modelValue')).toEqual([[false]])

      const typed = mountDrawer(confirmable())
      await flushPromises()
      await typed.find('textarea[data-test="pdd-confirm-reason"]').setValue('補登下班')
      box.confirm.mockRejectedValueOnce('cancel')
      await typed.find('[data-test="stub-drawer-close"]').trigger('click')
      await flushPromises()
      expect(box.confirm).toHaveBeenCalledTimes(1)
      expect(typed.emitted('update:modelValue')).toBeUndefined()
      box.confirm.mockResolvedValueOnce('confirm')
      await typed.find('[data-test="stub-drawer-close"]').trigger('click')
      await flushPromises()
      expect(typed.emitted('update:modelValue')).toEqual([[false]])
    })

    it('送出成功後清掉原因，之後關閉不再詢問', async () => {
      const wrapper = mountDrawer(confirmable())
      await flushPromises()
      wrapper.findAllComponents({ name: 'ElSelect' })[0].vm.$emit('update:modelValue', 1)
      await wrapper.find('textarea[data-test="pdd-confirm-reason"]').setValue('確認早車')
      await wrapper.find('[data-test="pdd-confirm-submit"]').trigger('click')
      await flushPromises()
      expect(api.confirm).toHaveBeenCalledTimes(1)
      expect((wrapper.find('textarea[data-test="pdd-confirm-reason"]').element as HTMLTextAreaElement).value).toBe('')
      await wrapper.find('[data-test="stub-drawer-close"]').trigger('click')
      await flushPromises()
      expect(box.confirm).not.toHaveBeenCalled()
    })

    it('改這天套用成功後，選擇就是新的現值（套用鈕停用、關閉不詢問）', async () => {
      const wrapper = mountDrawer(cell(1, W1))
      await flushPromises()
      wrapper.findAllComponents({ name: 'ElSelect' })[0].vm.$emit('update:modelValue', -1)
      await wrapper.vm.$nextTick()
      await wrapper.find('[data-test="pdd-day-apply"]').trigger('click')
      await flushPromises()
      expect(wrapper.find('[data-test="pdd-day-apply"]').attributes('disabled')).toBeDefined()
      await wrapper.find('[data-test="stub-drawer-close"]').trigger('click')
      await flushPromises()
      expect(box.confirm).not.toHaveBeenCalled()
    })
  })

  it('整天未匯入的日子：判定寫「未匯入」（與格子一致），匯入這天打卡是主要動作', async () => {
    const wrapper = mountDrawer(
      cell(1, W1, { actual: { status: 'data_incomplete', punch_in: null, punch_out: null } }),
      { importCovered: false },
    )
    await flushPromises()
    expect(wrapper.find('[data-test="pdd-actual"]').text()).toContain('未匯入')
    expect(wrapper.find('[data-test="pdd-import"]').classes()).toContain('el-button--primary')
  })

  it('改這天的「不另外調整」選項寫出會沿用什麼（沒有週排班時是預設工時，不是週排班）', async () => {
    const withWeekly = mountDrawer(cell(1, W1))
    await flushPromises()
    expect(withWeekly.findAllComponents({ name: 'ElOption' })[0].props('label')).toBe('不另外調整（沿用週排班：早車）')
    const noWeekly = mountDrawer(cell(1, W1, { plan: { source: 'employee' } }), { weeklyShiftId: null })
    await flushPromises()
    expect(noWeekly.findAllComponents({ name: 'ElOption' })[0].props('label')).toBe('不另外調整（沿用預設工時）')
  })

  it('已在出勤明細豁免的異常：判定寫出處理結果（與格子一致）', async () => {
    const wrapper = mountDrawer(cell(1, W1, { actual: { status: 'anomaly', confirmed_action: 'admin_waive', late_minutes: 12, punch_in: `${W1}T08:12:00`, punch_out: `${W1}T17:00:00` } }))
    await flushPromises()
    expect(wrapper.find('[data-test="pdd-actual"]').text()).toContain('出勤異常・已豁免・遲到 12 分')
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

describe('PersonDayDrawer 審查修正', () => {
  const DAY_OFF_CHOICE = -1
  const INHERIT_CHOICE = -2

  it('改回繼承：每日調整 id 讀取失敗時，套用會重查；查無就不報成功', async () => {
    api.getDaily
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ data: [] })
    const wrapper = mountDrawer(cell(1, W1, { plan: { source: 'daily', shift_type_id: 2, name: '晚車' } }))
    await flushPromises()
    wrapper.findAllComponents({ name: 'ElSelect' })[0].vm.$emit('update:modelValue', INHERIT_CHOICE)
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-test="pdd-day-apply"]').trigger('click')
    await flushPromises()
    expect(api.getDaily).toHaveBeenCalledTimes(2)
    expect(api.deleteDaily).not.toHaveBeenCalled()
    expect(message.success).not.toHaveBeenCalled()
    expect(message.warning).toHaveBeenCalledWith('這天已沒有每日調整，已重新整理')
    expect(wrapper.emitted('changed')).toHaveLength(1)
  })

  it('改這天：每日調整還在讀取時不能套用', async () => {
    api.getDaily.mockReturnValueOnce(new Promise(() => {}))
    const wrapper = mountDrawer(cell(1, W1, { plan: { source: 'daily', shift_type_id: 2, name: '晚車' } }))
    await flushPromises()
    wrapper.findAllComponents({ name: 'ElSelect' })[0].vm.$emit('update:modelValue', DAY_OFF_CHOICE)
    await wrapper.vm.$nextTick()
    const btn = wrapper.find('[data-test="pdd-day-apply"]')
    expect(btn.attributes('disabled')).not.toBeUndefined()
  })

  it('今天的判定與格子一致：只有上班卡＝上班中、沒打卡＝尚未打卡', async () => {
    const working = mountDrawer(cell(1, '2026-09-21', { actual: { punch_in: '2026-09-21T08:00:00' } }))
    expect(working.find('[data-test="pdd-actual"]').text()).toContain('上班中')
    expect(working.find('[data-test="pdd-actual"]').text()).not.toContain('尚未打卡')
    const none = mountDrawer(cell(1, '2026-09-21', { actual: {} }))
    expect(none.find('[data-test="pdd-actual"]').text()).toContain('尚未打卡')
  })

  it('改這天撞已打卡 409：友善提示並通知刷新', async () => {
    api.saveDaily.mockRejectedValueOnce({ response: { status: 409 }, displayMessage: '該日已有出勤紀錄，請至「班表與打卡核對」確認當日班別' })
    const wrapper = mountDrawer(cell(1, W1))
    await flushPromises()
    wrapper.findAllComponents({ name: 'ElSelect' })[0].vm.$emit('update:modelValue', DAY_OFF_CHOICE)
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-test="pdd-day-apply"]').trigger('click')
    await flushPromises()
    expect(message.warning).toHaveBeenCalledWith(expect.stringContaining('請改用「確認當日班別」'))
    expect(message.error).not.toHaveBeenCalled()
    expect(wrapper.emitted('changed')).toHaveLength(1)
  })

  it('確認當日班別撞版本不符 409：提示並通知刷新', async () => {
    api.confirm.mockRejectedValueOnce({ response: { status: 409 }, displayMessage: '班表、打卡或請假已更新，請重新核對' })
    const target = cell(1, W1, {
      edit: { plan: false, confirm: true, recorded: true, locked_reason: 'recorded' },
      actual: { status: 'possible_shift_change', original_shift_type_id: 1, version: 'm'.repeat(64), candidates: [] },
    })
    const wrapper = mountDrawer(target)
    await flushPromises()
    await wrapper.find('textarea[data-test="pdd-confirm-reason"]').setValue('核對')
    await wrapper.find('[data-test="pdd-confirm-submit"]').trigger('click')
    await flushPromises()
    expect(message.warning).toHaveBeenCalled()
    expect(wrapper.emitted('changed')).toHaveLength(1)
  })

  it('停用班別：改這天的選中項顯示「舊班別…（已停用）」而非裸 id', async () => {
    const wrapper = mountDrawer(cell(1, W1, { plan: { source: 'daily', shift_type_id: 3, name: '舊班別', work_start: '07:30', work_end: '16:00' } }))
    await flushPromises()
    const daySelect = wrapper.findAllComponents({ name: 'ElSelect' })[0]
    expect(daySelect.props('modelValue')).toBe(3)
    const current = wrapper.findAllComponents({ name: 'ElOption' }).find((o) => o.props('value') === 3)
    expect(current?.props('label')).toBe('舊班別 07:30–16:00（已停用）')
    expect(current?.props('disabled')).toBe(true)
  })
})
