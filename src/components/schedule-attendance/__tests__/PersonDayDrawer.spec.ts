import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import PersonDayDrawer from '../PersonDayDrawer.vue'
import ResolveCard from '@/components/attendance/ResolveCard.vue'
import type { GridCell, GridEmployee } from '@/utils/scheduleAttendanceGrid'
import type { FixedOffsetPattern } from '@/utils/attendancePatterns'
import { cell, day, employee, grid, SHIFTS, W1 } from './gridFixtures'

const api = vi.hoisted(() => ({ confirm: vi.fn(), getDaily: vi.fn(), saveDaily: vi.fn(), deleteDaily: vi.fn() }))
const message = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }))
vi.mock('@/api/attendanceReconciliation', () => ({ confirmReconciliationShift: api.confirm }))
vi.mock('@/api/shifts', () => ({ getDaily: api.getDaily, saveDaily: api.saveDaily, deleteDaily: api.deleteDaily }))
const att = vi.hoisted(() => ({ getAnomalyList: vi.fn(), upsertRecord: vi.fn(), batchConfirmAnomalies: vi.fn() }))
vi.mock('@/api/attendance', () => ({ getAnomalyList: att.getAnomalyList, upsertRecord: att.upsertRecord, batchConfirmAnomalies: att.batchConfirmAnomalies }))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))
vi.mock('@/composables/useErrorNotify', () => ({ useErrorNotify: () => ({ notify: vi.fn() }) }))
const undo = vi.hoisted(() => ({ show: vi.fn() }))
vi.mock('@/composables/useConfirmUndo', () => ({ showUndoToast: undo.show }))
const box = vi.hoisted(() => ({ confirm: vi.fn() }))
const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => router }))
vi.mock('element-plus', async (orig) => ({ ...(await orig<typeof import('element-plus')>()), ElMessage: message, ElMessageBox: box }))

const CALLER = grid().caller

type DrawerNav = { position: number | null; total: number; label: string; hasPrev: boolean; hasNext: boolean; back?: string | null }

function mountDrawer(target: GridCell, extra: Partial<{ sameDayCells: GridCell[]; caller: typeof CALLER; weeklyShiftId: number | null; employee: GridEmployee; importCovered: boolean; nav: DrawerNav | null; attach: boolean; actionsLocked: boolean }> = {}) {
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
      nav: extra.nav ?? null,
      actionsLocked: extra.actionsLocked ?? false,
    },
    // 鍵盤事件要從輸入框冒泡到 window，元件得掛在 document 上
    ...(extra.attach ? { attachTo: document.body } : {}),
    global: {
      plugins: [ElementPlus],
      stubs: {
        RouterLink: RouterLinkStub,
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
  att.getAnomalyList.mockResolvedValue({ data: { total: 0, pending: 0, confirmed: 0, items: [] } })
  att.upsertRecord.mockResolvedValue({ data: {} })
  att.batchConfirmAnomalies.mockResolvedValue({ data: {} })
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

  it('換班層：一般換班寫換班單編號；補登換班寫確認項目編號，不出現 #null（SPEC-026 3-3）', () => {
    const request = mountDrawer(cell(1, W1, { plan: { source: 'swap', swap_request_id: 5, shift_type_id: 2, name: '晚車' }, actual: {} }))
    expect(request.findAll('[data-test="pdd-chain"] li')[3].text()).toContain('換班單 #5：晚車')

    const backdated = mountDrawer(
      cell(1, W1, { plan: { source: 'swap', swap_request_id: null, swap_confirmation_item_id: 77, shift_type_id: 2, name: '晚車' }, actual: {} }),
    )
    const layer = backdated.findAll('[data-test="pdd-chain"] li')[3]
    expect(layer.text()).toContain('換班補登（確認項目 #77）：晚車')
    expect(layer.classes()).toContain('pdd__chain-item--active')
    expect(backdated.text()).not.toContain('#null')
  })

  it('換班層：兩種編號都沒有時只寫「換班」，不出現 #null', () => {
    const w = mountDrawer(cell(1, W1, { plan: { source: 'swap', swap_request_id: null, shift_type_id: 2, name: '晚車' }, actual: {} }))
    const text = w.findAll('[data-test="pdd-chain"] li')[3].text()
    expect(text).toContain('換班：晚車')
    expect(text).not.toContain('#null')
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
    expect(api.saveDaily).toHaveBeenCalledWith({ employee_id: 1, date: W1, day_off: true, notes: null })
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
      // 疑似換班：確認當日班別展開在前（缺卡時補卡在前、確認表單預設收起）
      actual: { status: 'possible_shift_change', version: 'v'.repeat(64), punch_in: `${W1}T07:52:00`, punch_out: `${W1}T17:10:00` },
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

    it('只算看得到的區塊：改這天的選擇在區塊消失後（例如 409 重載後已有打卡）不算未送出（審查 F4）', async () => {
      const wrapper = mountDrawer(cell(1, W1))
      await flushPromises()
      wrapper.findAllComponents({ name: 'ElSelect' })[0].vm.$emit('update:modelValue', -1)
      await wrapper.vm.$nextTick()
      await wrapper.setProps({ cell: cell(1, W1, { edit: { plan: false, confirm: false, locked_reason: 'recorded' }, actual: {} }) })
      await wrapper.find('[data-test="stub-drawer-close"]').trigger('click')
      await flushPromises()
      expect(box.confirm).not.toHaveBeenCalled()
      expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    })

    it('requestClose：頁面要程式關閉（看他整月）前先問；取消回 false', async () => {
      const wrapper = mountDrawer(confirmable())
      await flushPromises()
      type DrawerApi = { requestClose: () => Promise<boolean> }
      expect(await (wrapper.vm as unknown as DrawerApi).requestClose()).toBe(true)
      await wrapper.find('textarea[data-test="pdd-confirm-reason"]').setValue('補登下班')
      box.confirm.mockRejectedValueOnce('cancel')
      expect(await (wrapper.vm as unknown as DrawerApi).requestClose()).toBe(false)
      box.confirm.mockResolvedValueOnce('confirm')
      expect(await (wrapper.vm as unknown as DrawerApi).requestClose()).toBe(true)
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

  it('已在出勤明細豁免的異常：決策卡寫出處理結果，判定只寫一次', async () => {
    att.getAnomalyList.mockResolvedValue({ data: { total: 1, pending: 0, confirmed: 1, items: [
      { id: 101, employee_name: '林班導', employee_number: 'E001', date: W1, weekday: '一', type: 'late', type_label: '遲到', detail: '遲到 12 分鐘', estimated_deduction: 40, confirmed_action: 'admin_waive' },
    ] } })
    const wrapper = mountDrawer(cell(1, W1, { plan: { work_start: '08:00', work_end: '17:00' }, actual: { status: 'anomaly', confirmed_action: 'admin_waive', late_minutes: 12, punch_in: `${W1}T08:12:00`, punch_out: `${W1}T17:00:00` } }))
    await flushPromises()
    const resolve = wrapper.get('[data-test="pdd-resolve"]')
    expect(resolve.text()).toContain('已豁免')
    expect(resolve.get('[data-test="resolve-verdict"]').text()).toBe('遲到 12 分')
    // 分鐘數只寫一次（抽屜自己的判定區塊在決策卡優先時不畫）
    expect(wrapper.text().match(/遲到 12 分/g)).toHaveLength(1)
  })

  it('已封存的格子：「已封存」只寫一次', async () => {
    const wrapper = mountDrawer(cell(1, W1, { edit: { plan: false, confirm: false, recorded: true, locked_reason: 'finalized' }, actual: { status: 'missing_punch', attendance_id: 55 } }))
    await flushPromises()
    expect(wrapper.text().match(/封存/g)).toHaveLength(1)
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

  describe('就地處理打卡（抽屜內嵌補卡，推翻 B 期 R3）', () => {
    const RECORDED = { plan: false, confirm: true, recorded: true, locked_reason: 'recorded' as const }
    const missing = (extra: Record<string, unknown> = {}) => cell(1, W1, {
      edit: RECORDED,
      actual: { status: 'missing_punch', punch_in: `${W1}T07:52:00`, punch_out: null, attendance_id: 55, version: 'v'.repeat(64), ...extra },
    })
    const anomalyRow = { id: 55, employee_name: '林班導', employee_number: 'E001', date: W1, weekday: '一', confirmed_action: null, confirmed_by: null, confirmed_at: null, type: 'missing_punch', type_label: '未打卡(下班)', detail: '缺下班卡', estimated_deduction: null }
    const buttons = (w: ReturnType<typeof mountDrawer>) => w.find('[data-test="pdd-resolve"]').findAll('button').map((b) => b.text())
    const solidPrimaries = (w: ReturnType<typeof mountDrawer>) => w.findAll('.el-button--primary:not(.is-plain):not(.is-text):not(.is-link)').length

    it('缺卡：抓該人該天的異常卡；補卡排在確認當日班別前面、是唯一主要動作，確認當日班別收起', async () => {
      att.getAnomalyList.mockResolvedValue({ data: { total: 1, pending: 1, confirmed: 0, items: [anomalyRow] } })
      const w = mountDrawer(missing())
      await flushPromises()
      expect(att.getAnomalyList).toHaveBeenCalledWith({ year: 2026, month: 9, employee_id: 1, on_date: W1, status: 'all' })
      const resolve = w.find('[data-test="pdd-resolve"]')
      expect(resolve.text()).toContain('缺下班卡')
      expect(resolve.text()).not.toContain('第 1 / 1 筆')
      expect(w.findComponent(ResolveCard).props('context')).toMatchObject({ punch_in: '07:52', punch_out: null })
      expect(w.find('[data-test="pdd-confirm-submit"]').exists()).toBe(false)
      await w.find('[data-test="pdd-confirm-toggle"]').trigger('click')
      expect(w.find('[data-test="pdd-confirm-submit"]').classes()).not.toContain('el-button--primary')
      const html = w.html()
      expect(html.indexOf('data-test="pdd-resolve"')).toBeLessThan(html.indexOf('data-test="pdd-confirm"'))
      expect(w.find('[data-test="pdd-records"]').text()).toBe('看他整月')
    })

    it('補卡送出帶既有上班＋補填下班；接受扣款以出勤紀錄 id 送出；成功後通知格子重抓', async () => {
      att.getAnomalyList.mockResolvedValue({ data: { total: 1, pending: 1, confirmed: 0, items: [anomalyRow] } })
      const w = mountDrawer(missing())
      await flushPromises()
      w.findComponent(ResolveCard).vm.$emit('resolve', { action: 'punch', punch_in: '07:52', punch_out: '17:00' })
      await flushPromises()
      expect(att.upsertRecord).toHaveBeenCalledWith({ employee_id: 1, date: W1, punch_in: '07:52', punch_out: '17:00' })
      w.findComponent(ResolveCard).vm.$emit('resolve', { action: 'admin_accept' })
      await flushPromises()
      expect(att.batchConfirmAnomalies).toHaveBeenCalledWith({ attendance_ids: [55], action: 'admin_accept' })
      // 接受／豁免有復原提示：告訴面板不必再跳「已處理。下一筆…」；補打卡沒有復原，照舊
      expect(w.emitted('changed')).toEqual([[{ undoToast: false }], [{ undoToast: true }]])
      // 沒有佇列（不會自動跳）就不寫「跳到下一件」
      expect(undo.show).toHaveBeenCalledWith({ text: '已處理 9/14（一）林班導', attendanceIds: [55], onUndone: expect.any(Function) })
    })

    it('豁免帶理由送出；有佇列時復原提示寫出處理了誰哪天、跳到下一件；按復原後通知面板', async () => {
      att.getAnomalyList.mockResolvedValue({ data: { total: 1, pending: 1, confirmed: 0, items: [anomalyRow] } })
      const w = mountDrawer(missing(), { nav: { position: 3, total: 12, label: '9 月逐日待辦 3 / 12', hasPrev: true, hasNext: true } })
      await flushPromises()
      w.findComponent(ResolveCard).vm.$emit('resolve', { action: 'admin_waive', remark: '打卡機故障' })
      await flushPromises()
      expect(att.batchConfirmAnomalies).toHaveBeenCalledWith({ attendance_ids: [55], action: 'admin_waive', remark: '打卡機故障' })
      expect(undo.show).toHaveBeenCalledWith(expect.objectContaining({ text: '已處理 9/14（一）林班導，跳到下一件', attendanceIds: [55] }))
      ;(undo.show.mock.calls[0][0] as { onUndone: () => void }).onUndone()
      expect(w.emitted('undone')).toHaveLength(1)
    })

    it('決策卡優先（缺卡、出勤異常）：不再畫抽屜自己的應上班與打卡判定（決策卡已有）', async () => {
      att.getAnomalyList.mockResolvedValue({ data: { total: 1, pending: 1, confirmed: 0, items: [anomalyRow] } })
      const w = mountDrawer(missing())
      await flushPromises()
      expect(w.find('[data-test="pdd-plan"]').exists()).toBe(false)
      expect(w.find('[data-test="pdd-actual"]').exists()).toBe(false)
      expect(w.findAll('h3').map((h) => h.text())).not.toEqual(expect.arrayContaining(['應上班', '打卡與判定']))
      // 應上班與實際打卡改由決策卡寫一次
      const facts = w.get('[data-test="resolve-facts"]').text()
      expect(facts).toContain('早車 07:00–16:30（週排班）')
      expect(facts).toContain('07:52 – 無紀錄')
      expect(w.text().match(/07:52/g)).toHaveLength(1)
    })

    it('決策卡優先時，改這天與確認當日班別收進預設收合的「其他處理」', async () => {
      att.getAnomalyList.mockResolvedValue({ data: { total: 1, pending: 1, confirmed: 0, items: [anomalyRow] } })
      const w = mountDrawer(cell(1, W1, {
        edit: { plan: true, confirm: true, recorded: true, locked_reason: null },
        actual: { status: 'missing_punch', punch_in: `${W1}T07:52:00`, punch_out: null, attendance_id: 55 },
      }))
      await flushPromises()
      const more = w.get('[data-test="pdd-more"]')
      expect(more.element.tagName).toBe('DETAILS')
      expect(more.attributes('open')).toBeUndefined()
      expect(more.get('summary').text()).toBe('其他處理：改這天班別・確認是換班')
      expect(more.find('[data-test="pdd-edit-day"]').exists()).toBe(true)
      expect(more.find('[data-test="pdd-confirm"]').exists()).toBe(true)
      // 收起來的次要動作不搶主色
      expect(w.get('[data-test="pdd-day-apply"]').classes()).not.toContain('el-button--primary')
      // 只有確認當日班別時，標題只寫那一項
      const confirmOnly = mountDrawer(missing())
      await flushPromises()
      expect(confirmOnly.get('[data-test="pdd-more"] summary').text()).toBe('其他處理：確認是換班')
    })

    it('不是決策卡優先（疑似換班、疑似缺勤）：改這天與確認當日班別照舊攤開，不收進「其他處理」', async () => {
      const swap = mountDrawer(cell(1, W1, { edit: RECORDED, actual: { status: 'possible_shift_change', punch_in: `${W1}T08:31:00`, punch_out: `${W1}T18:02:00`, attendance_id: 55 } }))
      const absent = mountDrawer(cell(1, W1, { edit: { plan: true, confirm: false, recorded: false, locked_reason: null }, actual: { status: 'suspected_absence', attendance_id: null } }))
      await flushPromises()
      for (const w of [swap, absent]) expect(w.find('[data-test="pdd-more"]').exists()).toBe(false)
      expect(swap.find('[data-test="pdd-actual"]').exists()).toBe(true)
      expect(absent.find('[data-test="pdd-edit-day"]').exists()).toBe(true)
    })

    it('後端還沒支援人／日篩選（回傳整月）時，只取該人該天的卡，不會顯示別人的異常', async () => {
      const others = { ...anomalyRow, id: 99, employee_number: 'E002', detail: '別人的遲到' }
      const otherDay = { ...anomalyRow, id: 98, date: '2026-09-15', detail: '別天的缺卡' }
      att.getAnomalyList.mockResolvedValue({ data: { total: 3, pending: 3, confirmed: 0, items: [others, otherDay, anomalyRow] } })
      const w = mountDrawer(missing())
      await flushPromises()
      const text = w.find('[data-test="pdd-resolve"]').text()
      expect(text).toContain('缺下班卡')
      expect(text).not.toContain('別人的遲到')
      expect(text).not.toContain('別天的缺卡')
    })

    it('格子重抓後（版本變了）重新抓異常卡', async () => {
      const w = mountDrawer(missing())
      await flushPromises()
      expect(att.getAnomalyList).toHaveBeenCalledTimes(1)
      await w.setProps({ cell: missing({ version: 'w'.repeat(64), confirmed_action: 'admin_waive' }) })
      await flushPromises()
      expect(att.getAnomalyList).toHaveBeenCalledTimes(2)
      expect(w.find('[data-test="pdd-resolve"]').text()).toContain('已豁免')
    })

    it('疑似換班：確認當日班別在前且是主要動作、候選可點選帶入；補卡只給接受扣款／豁免', async () => {
      att.getAnomalyList.mockResolvedValue({ data: { total: 1, pending: 1, confirmed: 0, items: [{ ...anomalyRow, type: 'late', type_label: '遲到', detail: '遲到 91 分' }] } })
      const swap = cell(1, W1, {
        edit: RECORDED,
        actual: {
          status: 'possible_shift_change', punch_in: `${W1}T08:31:00`, punch_out: `${W1}T18:02:00`, attendance_id: 55, original_shift_type_id: 1,
          candidates: [{ shift_type_id: 2, name: '晚車', work_start: '08:30', work_end: '18:00' }, { shift_type_id: 3, name: '舊班別', work_start: '07:30', work_end: '16:00' }],
        },
      })
      const w = mountDrawer(swap)
      await flushPromises()
      const html = w.html()
      expect(html.indexOf('data-test="pdd-confirm"')).toBeLessThan(html.indexOf('data-test="pdd-resolve"'))
      expect(w.find('[data-test="pdd-confirm-submit"]').classes()).toContain('el-button--primary')
      await w.find('[data-test="pdd-candidate-2"]').trigger('click')
      expect(w.findAllComponents({ name: 'ElSelect' })[0].props('modelValue')).toBe(2)
      expect(buttons(w)).not.toContain('補打卡並重算')
      expect(buttons(w)).toEqual(expect.arrayContaining(['接受扣款', '豁免…']))
    })

    it('疑似缺勤（沒有出勤紀錄列）：補登上下班與改這天並列、都不是主要按鈕；不抓異常清單', async () => {
      const absent = cell(1, W1, { edit: { plan: true, confirm: false, recorded: false, locked_reason: null }, actual: { status: 'suspected_absence', attendance_id: null, punch_in: null, punch_out: null } })
      const w = mountDrawer(absent)
      await flushPromises()
      expect(att.getAnomalyList).not.toHaveBeenCalled()
      expect(buttons(w)).toEqual(['補打卡並重算'])
      expect(w.find('[data-test="pdd-resolve"]').find('button').classes()).not.toContain('el-button--primary')
      expect(w.find('[data-test="pdd-day-apply"]').classes()).not.toContain('el-button--primary')
      w.findComponent(ResolveCard).vm.$emit('resolve', { action: 'punch', punch_in: '08:00', punch_out: '17:00' })
      await flushPromises()
      expect(att.upsertRecord).toHaveBeenCalledWith({ employee_id: 1, date: W1, punch_in: '08:00', punch_out: '17:00' })
    })

    it('疑似缺勤但有出勤紀錄列（沒打卡）：並列的是補登與確認當日班別，兩者都不是主要按鈕', async () => {
      const w = mountDrawer(cell(1, W1, { edit: RECORDED, actual: { status: 'suspected_absence', attendance_id: 77, punch_in: null, punch_out: null } }))
      await flushPromises()
      expect(w.find('[data-test="pdd-resolve"]').exists()).toBe(true)
      // 確認當日班別不是這天要做的事：先收起，要用再展開
      expect(w.find('[data-test="pdd-confirm-submit"]').exists()).toBe(false)
      await w.find('[data-test="pdd-confirm-toggle"]').trigger('click')
      expect(w.find('[data-test="pdd-confirm-submit"]').classes()).not.toContain('el-button--primary')
      expect(solidPrimaries(w)).toBe(0)
    })

    it('不顯示補卡：沒有出勤寫入權限、已封存、資料待補（等匯入）；沒有查看權限也不抓', async () => {
      const noWrite = mountDrawer(missing(), { caller: { ...CALLER, can_edit_attendance: false } })
      await flushPromises()
      expect(noWrite.find('[data-test="pdd-resolve"]').exists()).toBe(false)
      const noRead = mountDrawer(missing(), { caller: { ...CALLER, can_view_attendance: false } })
      await flushPromises()
      expect(noRead.find('[data-test="pdd-resolve"]').exists()).toBe(false)
      const finalized = mountDrawer(cell(1, W1, { edit: { plan: false, confirm: false, recorded: true, locked_reason: 'finalized' }, actual: { status: 'missing_punch', attendance_id: 55 } }))
      await flushPromises()
      expect(finalized.find('[data-test="pdd-resolve"]').exists()).toBe(false)
      // 整天未匯入的資料待補：等匯入就好，不給補登
      const incomplete = mountDrawer(cell(1, W1, { actual: { status: 'data_incomplete', attendance_id: null } }), { importCovered: false })
      await flushPromises()
      expect(incomplete.find('[data-test="pdd-resolve"]').exists()).toBe(false)
      expect(att.getAnomalyList).not.toHaveBeenCalled() // 不顯示就不抓（也不讓只有排班權限的人打到 403）
    })

    it('每種判定的抽屜最多一顆實心主要按鈕（審查 F6）', async () => {
      att.getAnomalyList.mockResolvedValue({ data: { total: 1, pending: 1, confirmed: 0, items: [anomalyRow] } })
      const modes = [
        missing(),
        cell(1, W1, { edit: RECORDED, actual: { status: 'anomaly', punch_in: `${W1}T08:12:00`, punch_out: `${W1}T17:00:00`, attendance_id: 55 } }),
        cell(1, W1, { edit: RECORDED, actual: { status: 'possible_shift_change', punch_in: `${W1}T08:31:00`, punch_out: `${W1}T18:02:00`, attendance_id: 55, candidates: [{ shift_type_id: 2, name: '晚車', work_start: '08:30', work_end: '18:00' }] } }),
        cell(1, W1, { edit: { plan: true, confirm: false, recorded: false, locked_reason: null }, actual: { status: 'suspected_absence', attendance_id: null } }),
      ]
      for (const target of modes) {
        const w = mountDrawer(target)
        await flushPromises()
        const toggle = w.find('[data-test="pdd-confirm-toggle"]')
        if (toggle.exists()) await toggle.trigger('click')
        expect(solidPrimaries(w), target.actual!.status).toBeLessThanOrEqual(1)
      }
    })

    it('本人、不在職、今天以後的格子不顯示補卡（審查 F6）', async () => {
      const self = mountDrawer(cell(1, W1, { edit: { plan: false, confirm: false, recorded: true, locked_reason: 'self' }, actual: { status: 'missing_punch', attendance_id: 55 } }))
      const left = mountDrawer(cell(1, W1, { employed: false, edit: { plan: false, confirm: false, recorded: true, locked_reason: 'not_employed' }, actual: { status: 'missing_punch', attendance_id: 55 } }))
      const today = mountDrawer(cell(1, '2026-09-21', { edit: RECORDED, actual: { status: 'missing_punch', attendance_id: 55 } }))
      await flushPromises()
      for (const w of [self, left, today]) expect(w.find('[data-test="pdd-resolve"]').exists()).toBe(false)
      expect(att.getAnomalyList).not.toHaveBeenCalled()
    })

    it('本人未打卡日（疑似缺勤、沒有出勤紀錄列）：不提供補登並說明原因；他人同樣的格子照舊（F2）', async () => {
      const absent = cell(1, W1, { edit: { plan: true, confirm: false, recorded: false, locked_reason: null }, actual: { status: 'suspected_absence', attendance_id: null, punch_in: null, punch_out: null } })
      const own = mountDrawer(absent, { caller: { ...CALLER, employee_id: 1 } })
      await flushPromises()
      expect(own.find('[data-test="pdd-resolve"]').exists()).toBe(false)
      expect(own.find('[data-test="pdd-self-note"]').text()).toBe('本人出勤需由其他行政人員補登')
      expect(own.find('[data-test="pdd-edit-day"]').exists()).toBe(true)
      const others = mountDrawer(absent, { caller: { ...CALLER, employee_id: 2 } })
      await flushPromises()
      expect(others.find('[data-test="pdd-resolve"]').exists()).toBe(true)
      expect(others.find('[data-test="pdd-self-note"]').exists()).toBe(false)
    })

    it('換格時舊請求晚回來不會蓋掉新格的卡（審查 F6）', async () => {
      let releaseFirst: (v: unknown) => void = () => {}
      att.getAnomalyList
        .mockReturnValueOnce(new Promise((r) => { releaseFirst = r }))
        .mockResolvedValueOnce({ data: { total: 1, pending: 1, confirmed: 0, items: [{ ...anomalyRow, id: 66, employee_number: 'E002', detail: '王副導的缺卡' }] } })
      const w = mountDrawer(missing())
      await flushPromises()
      await w.setProps({ cell: cell(2, W1, { edit: RECORDED, actual: { status: 'missing_punch', punch_in: `${W1}T07:40:00`, attendance_id: 66 } }), employee: employee(2, '王副導') })
      await flushPromises()
      releaseFirst({ data: { total: 1, pending: 1, confirmed: 0, items: [anomalyRow] } })
      await flushPromises()
      expect(w.find('[data-test="pdd-resolve"]').text()).toContain('王副導的缺卡')
      expect(w.find('[data-test="pdd-resolve"]').text()).not.toContain('缺下班卡')
    })

    it('重抓後判定從缺卡變疑似換班：確認當日班別重新展開、成為主要動作（審查 F1）', async () => {
      const w = mountDrawer(missing())
      await flushPromises()
      expect(w.find('[data-test="pdd-confirm-submit"]').exists()).toBe(false)
      await w.setProps({ cell: missing({ status: 'possible_shift_change', punch_out: `${W1}T18:02:00`, version: 'x'.repeat(64) }) })
      await flushPromises()
      expect(w.find('[data-test="pdd-confirm-submit"]').classes()).toContain('el-button--primary')
    })

    it('有出勤權限但沒有排班權限：不說「沒有修改權限」（與補卡區矛盾），改說沒有改班權限（審查 F3）', async () => {
      const w = mountDrawer(cell(1, W1, { edit: { plan: false, confirm: false, recorded: true, locked_reason: 'no_permission' }, actual: { status: 'missing_punch', punch_in: `${W1}T07:52:00`, attendance_id: 55 } }))
      await flushPromises()
      expect(w.find('[data-test="pdd-resolve"]').exists()).toBe(true)
      expect(w.find('[data-test="pdd-locked"]').text()).toBe('沒有改班權限；打卡仍可在下方處理')
    })

    it('讀取異常卡失敗：說明並保留「看他整月」退路，不顯示補卡按鈕', async () => {
      att.getAnomalyList.mockRejectedValue(new Error('boom'))
      const w = mountDrawer(missing())
      await flushPromises()
      expect(w.find('[data-test="pdd-resolve"]').text()).toContain('讀取異常資料失敗，可按「看他整月」到逐人檢視處理')
      expect(w.findComponent(ResolveCard).exists()).toBe(false)
      expect(w.find('[data-test="pdd-records"]').exists()).toBe(true)
    })
  })
})

describe('PersonDayDrawer 上一筆／下一筆待處理', () => {
  const NAV: DrawerNav = { position: 3, total: 12, label: '9 月逐日待辦 3 / 12', hasPrev: true, hasNext: true }
  const press = (key: string, target: EventTarget = document.body) => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  }

  it('寫出面板給的佇列標籤（整月逐日待辦第幾件）；上一件、下一件送出 navigate；到頭到尾就停用', async () => {
    const wrapper = mountDrawer(cell(1, W1, { actual: { status: 'anomaly', late_minutes: 20, punch_in: `${W1}T07:20:00`, punch_out: `${W1}T16:30:00` } }), { nav: NAV })
    await flushPromises()
    expect(wrapper.get('[data-test="pdd-nav-pos"]').text()).toBe('9 月逐日待辦 3 / 12')
    expect(wrapper.get('[data-test="pdd-prev"]').text()).toBe('上一件')
    expect(wrapper.get('[data-test="pdd-next"]').text()).toBe('下一件')
    await wrapper.get('[data-test="pdd-next"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-test="pdd-prev"]').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('navigate')).toEqual([[1], [-1]])
    await wrapper.setProps({ nav: { position: 12, total: 12, label: '9 月逐日待辦 12 / 12', hasPrev: true, hasNext: false } })
    expect(wrapper.get('[data-test="pdd-next"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('開的是不在佇列裡的格子：寫共幾件逐日待辦，仍可跳到下一件', async () => {
    const wrapper = mountDrawer(cell(1, W1, { actual: {} }), { nav: { position: null, total: 5, label: '共 5 件逐日待辦', hasPrev: false, hasNext: true } })
    await flushPromises()
    expect(wrapper.get('[data-test="pdd-nav-pos"]').text()).toBe('共 5 件逐日待辦')
    wrapper.unmount()
  })

  it('沒有待處理（或沒有導覽）就不顯示導覽列', async () => {
    expect(mountDrawer(cell(1, W1, { actual: {} }), { nav: { position: null, total: 0, label: '共 0 件逐日待辦', hasPrev: false, hasNext: false } }).find('[data-test="pdd-nav"]').exists()).toBe(false)
    expect(mountDrawer(cell(1, W1, { actual: {} })).find('[data-test="pdd-nav"]').exists()).toBe(false)
  })

  it('J／K 切換；在輸入框裡打字不算', async () => {
    const wrapper = mountDrawer(cell(1, W1, { actual: { status: 'possible_shift_change', punch_in: `${W1}T08:01:00`, punch_out: `${W1}T17:31:00`, candidates: [{ shift_type_id: 2, name: '晚車', work_start: '08:30', work_end: '18:00' }] }, edit: { confirm: true } }), { nav: NAV, attach: true })
    await flushPromises()
    press('j')
    await flushPromises()
    press('k')
    await flushPromises()
    press('j', wrapper.get('textarea[data-test="pdd-confirm-reason"]').element)
    await flushPromises()
    expect(wrapper.emitted('navigate')).toEqual([[1], [-1]])
    // 卸載後不再聽鍵盤（拿掉的是掛上去的同一個 handler）
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const again = mountDrawer(cell(1, W1, { actual: {} }), { nav: NAV })
    const handler = add.mock.calls.find(([type]) => type === 'keydown')?.[1]
    again.unmount()
    expect(handler).toBeDefined()
    expect(remove).toHaveBeenCalledWith('keydown', handler)
    add.mockRestore()
    remove.mockRestore()
    wrapper.unmount()
  })

  it('原因打到一半要換筆：先問，取消就留在這筆', async () => {
    const wrapper = mountDrawer(cell(1, W1, { actual: { status: 'possible_shift_change', punch_in: `${W1}T08:01:00`, punch_out: `${W1}T17:31:00` }, edit: { confirm: true } }), { nav: NAV })
    await flushPromises()
    await wrapper.get('textarea[data-test="pdd-confirm-reason"]').setValue('補登')
    box.confirm.mockRejectedValueOnce('cancel')
    await wrapper.get('[data-test="pdd-next"]').trigger('click')
    await flushPromises()
    expect(box.confirm).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('navigate')).toBeUndefined()
    wrapper.unmount()
  })

  it('補卡時間填了還沒送出：關閉或換筆前也要問（原本按 Esc 會無聲丟掉）', async () => {
    att.getAnomalyList.mockResolvedValue({ data: { total: 1, pending: 1, confirmed: 0, items: [
      { id: 101, employee_name: '林班導', employee_number: 'E001', date: W1, weekday: '一', type: 'missing_punch', type_label: '未打卡', detail: '缺下班打卡', estimated_deduction: 0, confirmed_action: null },
    ] } })
    const wrapper = mountDrawer(cell(1, W1, { actual: { status: 'missing_punch', attendance_id: 101, punch_in: `${W1}T07:00:00` } }), { nav: NAV })
    await flushPromises()
    type DrawerApi = { requestClose: () => Promise<boolean> }
    expect(await (wrapper.vm as unknown as DrawerApi).requestClose()).toBe(true)
    wrapper.findComponent(ResolveCard).findAllComponents({ name: 'ElTimePicker' })[0].vm.$emit('update:modelValue', '17:00')
    await flushPromises()
    box.confirm.mockRejectedValueOnce('cancel')
    expect(await (wrapper.vm as unknown as DrawerApi).requestClose()).toBe(false)
    wrapper.unmount()
  })
})

describe('PersonDayDrawer 沒有打卡的應上班日', () => {
  it('疑似缺勤：寫出不處理會算曠職、三種處理方式，並可建立請假單（帶人帶日期）', async () => {
    const wrapper = mountDrawer(cell(2, W1, { actual: { status: 'suspected_absence', attendance_id: null } }))
    await flushPromises()
    const box = wrapper.get('[data-test="pdd-absence"]')
    expect(box.text()).toContain('算曠職扣款')
    expect(box.text()).toContain('在下方補登上下班')
    await wrapper.get('[data-test="pdd-create-leave"]').trigger('click')
    await flushPromises()
    expect(router.push).toHaveBeenCalledWith({ path: '/leaves', query: { create: '1', employee_id: '2', date: W1 } })
  })

  it('建立請假單會離開這頁：原因打到一半先問，取消就不走', async () => {
    const wrapper = mountDrawer(cell(2, W1, { edit: { confirm: true, plan: true }, actual: { status: 'suspected_absence', attendance_id: null } }))
    await flushPromises()
    await wrapper.get('[data-test="pdd-confirm-toggle"]').trigger('click')
    await wrapper.get('textarea[data-test="pdd-confirm-reason"]').setValue('補登')
    box.confirm.mockRejectedValueOnce('cancel')
    await wrapper.get('[data-test="pdd-create-leave"]').trigger('click')
    await flushPromises()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('不能補登的格子：已封存不提示；沒有寫入權限、本人只寫後果，不叫人「在下方補登」', async () => {
    const absent = (extra: Parameters<typeof cell>[2] = {}) => cell(2, W1, { ...extra, actual: { status: 'suspected_absence', attendance_id: null } })
    expect(mountDrawer(absent({ edit: { locked_reason: 'finalized', plan: false } })).find('[data-test="pdd-absence"]').exists()).toBe(false)
    const readOnly = mountDrawer(absent(), { caller: { ...CALLER, can_edit_attendance: false } })
    await flushPromises()
    const text = readOnly.get('[data-test="pdd-absence"]').text()
    expect(text).toContain('算曠職扣款')
    expect(text).not.toContain('在下方補登')
    expect(text).toContain('由有出勤寫入權限的行政人員')
    const own = mountDrawer(absent(), { caller: { ...CALLER, employee_id: 2 } })
    await flushPromises()
    expect(own.get('[data-test="pdd-absence"]').text()).not.toContain('在下方補登')
  })

  it('資料待補（當天有匯入、打卡檔裡沒有他）：管理員可在抽屜補登，文案不自相矛盾、不叫人去找有權限的人', async () => {
    const w = mountDrawer(cell(2, W1, { actual: { status: 'data_incomplete', attendance_id: null, punch_in: null, punch_out: null, reason: '本日打卡資料尚未匯入或未涵蓋此員工，暫不判缺勤' } }))
    await flushPromises()
    const text = w.get('[data-test="pdd-absence"]').text()
    expect(text).toContain('格子暫不判缺勤，但算薪只看有沒有打卡')
    expect(text).toContain('在下方補登上下班')
    expect(text).not.toContain('由有出勤寫入權限的行政人員')
    // 後端「暫不判缺勤」那句已改寫進上面，不再單獨出現（曾和「會算曠職」並排矛盾）
    expect(w.text()).not.toContain('尚未匯入或未涵蓋此員工')
    expect(w.find('[data-test="pdd-resolve"]').text()).toContain('補登上下班')
    expect(att.getAnomalyList).not.toHaveBeenCalled()
  })

  it('有匯入但沒有這個人的資料待補也一樣會被算曠職；整天未匯入、有打卡、不用上班的日子不提示', async () => {
    expect(mountDrawer(cell(2, W1, { actual: { status: 'data_incomplete' } })).find('[data-test="pdd-absence"]').exists()).toBe(true)
    expect(mountDrawer(cell(2, W1, { actual: { status: 'data_incomplete' } }), { importCovered: false }).find('[data-test="pdd-absence"]').exists()).toBe(false)
    expect(mountDrawer(cell(2, W1, { actual: { status: 'missing_punch', punch_in: `${W1}T07:00:00` } })).find('[data-test="pdd-absence"]').exists()).toBe(false)
    expect(mountDrawer(cell(2, '2026-09-19', { plan: { expected: false }, actual: { status: 'off_day' } })).find('[data-test="pdd-absence"]').exists()).toBe(false)
  })
})

describe('PersonDayDrawer 版面順序', () => {
  const shiftChange = () => cell(1, W1, {
    actual: { status: 'possible_shift_change', punch_in: `${W1}T08:31:00`, punch_out: `${W1}T18:02:00`, candidates: [{ shift_type_id: 2, name: '晚車', work_start: '08:30', work_end: '18:00' }] },
    edit: { confirm: true, plan: false, recorded: true, locked_reason: 'recorded' },
  })

  it('判定與動作在前，班別來源收在最後（預設收起，標題寫出生效的那一層）', async () => {
    const wrapper = mountDrawer(shiftChange())
    await flushPromises()
    const html = wrapper.html()
    expect(html.indexOf('data-test="pdd-actual"')).toBeLessThan(html.indexOf('data-test="pdd-confirm"'))
    expect(html.indexOf('data-test="pdd-confirm"')).toBeLessThan(html.indexOf('data-test="pdd-chain"'))
    const source = wrapper.get('[data-test="pdd-source"]')
    expect(source.element.tagName).toBe('DETAILS')
    expect(source.attributes('open')).toBeUndefined()
    expect(source.get('summary').text()).toBe('班別來源：週排班')
  })

  it('點系統推測的班別：原因還空著就帶入建議原因；已經打了就不蓋掉', async () => {
    const wrapper = mountDrawer(shiftChange())
    await flushPromises()
    const reason = wrapper.get('textarea[data-test="pdd-confirm-reason"]')
    // 開抽屜時不自動帶（否則還沒動就算未送出）
    expect((reason.element as HTMLTextAreaElement).value).toBe('')
    await wrapper.get('[data-test="pdd-candidate-2"]').trigger('click')
    expect((reason.element as HTMLTextAreaElement).value).toBe('打卡時間符合晚車 08:30–18:00（系統推測）')
    await reason.setValue('園長口頭同意換班')
    await wrapper.get('[data-test="pdd-candidate-2"]').trigger('click')
    expect((reason.element as HTMLTextAreaElement).value).toBe('園長口頭同意換班')
  })
})

describe('PersonDayDrawer 審查修正', () => {
  const NAV: DrawerNav = { position: 3, total: 12, label: '9 月逐日待辦 3 / 12', hasPrev: true, hasNext: true }
  const press = (target: EventTarget, init: KeyboardEventInit = {}) => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true, ...init }))

  it('焦點在疊在上面的其他對話框（例如匯入打卡）時，J／K 不換筆；按住不放不連續換', async () => {
    const wrapper = mountDrawer(cell(1, W1, { actual: {} }), { nav: NAV, attach: true })
    await flushPromises()
    const overlay = document.createElement('div')
    overlay.className = 'el-overlay'
    const tab = document.createElement('button')
    overlay.appendChild(tab)
    document.body.appendChild(overlay)
    press(tab)
    press(document.body, { repeat: true })
    await flushPromises()
    expect(wrapper.emitted('navigate')).toBeUndefined()
    press(document.body)
    await flushPromises()
    expect(wrapper.emitted('navigate')).toEqual([[1]])
    overlay.remove()
    wrapper.unmount()
  })

  it('剛自動跳過來時鎖住動作（避免連點落到下一筆）', async () => {
    const wrapper = mountDrawer(cell(1, W1, { edit: { confirm: true, plan: true }, actual: { status: 'possible_shift_change', punch_in: `${W1}T08:31:00`, punch_out: `${W1}T18:02:00`, candidates: [{ shift_type_id: 2, name: '晚車', work_start: '08:30', work_end: '18:00' }] } }), { actionsLocked: true })
    await flushPromises()
    await wrapper.get('textarea[data-test="pdd-confirm-reason"]').setValue('換班')
    expect(wrapper.get('[data-test="pdd-confirm-submit"]').attributes('disabled')).toBeDefined()
    wrapper.findAllComponents({ name: 'ElSelect' })[0].vm.$emit('update:modelValue', -1)
    await flushPromises()
    expect(wrapper.get('[data-test="pdd-day-apply"]').attributes('disabled')).toBeDefined()
    expect(wrapper.findComponent({ name: 'DayResolveSection' }).props('locked')).toBe(true)
  })

  it('自動跳過來後可以回剛才那格', async () => {
    const wrapper = mountDrawer(cell(1, W1, { actual: {} }), { nav: { ...NAV, back: '林班導 9/14' } })
    await flushPromises()
    await wrapper.get('[data-test="pdd-back"]').trigger('click')
    expect(wrapper.emitted('back')).toHaveLength(1)
    expect(mountDrawer(cell(1, W1, { actual: {} }), { nav: NAV }).find('[data-test="pdd-back"]').exists()).toBe(false)
  })

  it('同一格重抓（cell 物件換新）不重設打到一半的原因', async () => {
    const shift = () => cell(1, W1, { edit: { confirm: true, plan: false, recorded: true, locked_reason: 'recorded' }, actual: { status: 'possible_shift_change', punch_in: `${W1}T08:31:00`, punch_out: `${W1}T18:02:00` } })
    const wrapper = mountDrawer(shift())
    await flushPromises()
    await wrapper.get('textarea[data-test="pdd-confirm-reason"]').setValue('園長同意')
    await wrapper.setProps({ cell: shift() })
    await flushPromises()
    expect((wrapper.get('textarea[data-test="pdd-confirm-reason"]').element as HTMLTextAreaElement).value).toBe('園長同意')
    // 換到另一格才重設
    await wrapper.setProps({ cell: cell(1, '2026-09-15', { edit: { confirm: true }, actual: { status: 'possible_shift_change', punch_in: '2026-09-15T08:31:00', punch_out: '2026-09-15T18:02:00' } }) })
    await flushPromises()
    expect((wrapper.get('textarea[data-test="pdd-confirm-reason"]').element as HTMLTextAreaElement).value).toBe('')
  })
})

describe('PersonDayDrawer 改這天與換班格（QA #21）', () => {
  it('非換班格改班：帶回原本每日調整的備註，不讓後端存成 None', async () => {
    const wrapper = mountDrawer(cell(1, W1, { plan: { source: 'daily', shift_type_id: 2, name: '晚車', daily_notes: '支援大班' } }))
    await flushPromises()
    wrapper.findAllComponents({ name: 'ElSelect' })[0].vm.$emit('update:modelValue', 1)
    await wrapper.vm.$nextTick()
    await wrapper.get('[data-test="pdd-day-apply"]').trigger('click')
    await flushPromises()
    expect(api.saveDaily).toHaveBeenCalledWith({ employee_id: 1, date: W1, shift_type_id: 1, day_off: false, notes: '支援大班' })
  })

  it('換班格：寫出和誰對調、要先撤銷換班，改這天整區停用', async () => {
    const me = cell(1, W1, { plan: { source: 'swap', shift_type_id: 2, name: '晚車', swap_request_id: 9, daily_notes: '換班 #9' } })
    const partner = cell(2, W1, { plan: { source: 'swap', shift_type_id: 1, name: '早車', swap_request_id: 9, daily_notes: '換班 #9' } })
    const wrapper = mountDrawer(me, { sameDayCells: [me, partner] })
    await flushPromises()
    const hint = wrapper.get('[data-test="pdd-swap-locked"]')
    expect(hint.text()).toContain('換班單 #9')
    expect(hint.text()).toContain('王副導')
    expect(hint.text()).toContain('需先撤銷換班')
    expect(wrapper.findAllComponents({ name: 'ElSelect' })[0].props('disabled')).toBe(true)
    expect(wrapper.get('[data-test="pdd-day-apply"]').attributes('disabled')).toBeDefined()
    expect(api.getDaily).not.toHaveBeenCalled()
  })

  it('換班補登格（沒有換班單）也一樣停用', async () => {
    const me = cell(1, W1, { plan: { source: 'swap', shift_type_id: 2, name: '晚車', swap_request_id: null, swap_confirmation_item_id: 5 } })
    const wrapper = mountDrawer(me)
    await flushPromises()
    expect(wrapper.get('[data-test="pdd-swap-locked"]').text()).toContain('換班補登')
    expect(wrapper.get('[data-test="pdd-day-apply"]').attributes('disabled')).toBeDefined()
  })
})

describe('PersonDayDrawer 送出途中換格（QA P3）', () => {
  it('改這天送出途中換到別格：舊格完成不改寫新格的選擇', async () => {
    let resolveSave: (v: unknown) => void = () => {}
    api.saveDaily.mockReturnValueOnce(new Promise((r) => { resolveSave = r }))
    const wrapper = mountDrawer(cell(1, W1))
    await flushPromises()
    wrapper.findAllComponents({ name: 'ElSelect' })[0].vm.$emit('update:modelValue', -1)
    await wrapper.vm.$nextTick()
    await wrapper.get('[data-test="pdd-day-apply"]').trigger('click')
    await wrapper.setProps({ cell: cell(2, W1) })
    await flushPromises()
    wrapper.findAllComponents({ name: 'ElSelect' })[0].vm.$emit('update:modelValue', 2)
    await wrapper.vm.$nextTick()
    resolveSave({ data: {} })
    await flushPromises()
    // 新格的選擇（晚車）仍是未套用狀態：套用鈕可按
    expect(wrapper.findAllComponents({ name: 'ElSelect' })[0].props('modelValue')).toBe(2)
    expect(wrapper.get('[data-test="pdd-day-apply"]').attributes('disabled')).toBeUndefined()
  })

  it('確認當日班別送出途中換格：舊格完成不清掉新格打到一半的原因', async () => {
    let resolveConfirm: (v: unknown) => void = () => {}
    api.confirm.mockReturnValueOnce(new Promise((r) => { resolveConfirm = r }))
    const shift = (id: number) => cell(id, W1, { edit: { confirm: true, plan: false, recorded: true, locked_reason: 'recorded' }, actual: { status: 'possible_shift_change', punch_in: `${W1}T08:31:00`, punch_out: `${W1}T18:02:00` } })
    const wrapper = mountDrawer(shift(1))
    await flushPromises()
    await wrapper.get('textarea[data-test="pdd-confirm-reason"]').setValue('對調')
    await wrapper.get('[data-test="pdd-confirm-submit"]').trigger('click')
    await wrapper.setProps({ cell: shift(2) })
    await flushPromises()
    await wrapper.get('textarea[data-test="pdd-confirm-reason"]').setValue('另一位')
    resolveConfirm({ data: { message: 'ok', updated_count: 1 } })
    await flushPromises()
    expect((wrapper.get('textarea[data-test="pdd-confirm-reason"]').element as HTMLTextAreaElement).value).toBe('另一位')
  })
})

describe('PersonDayDrawer 設定問題提醒（第五輪審查 P1）', () => {
  const offset = (overrides: Partial<FixedOffsetPattern> = {}): FixedOffsetPattern => ({
    kind: 'fixed_offset', employeeId: 1, name: '林班導', roleLabel: null, issueCount: 18, matchCount: 18, matchDates: [W1],
    expectedDays: 20, punchedDays: 20, firstDate: W1, bothDays: 20, lateDays: 18, earlyDays: 18,
    typicalLate: 57, typicalEarly: 342, typicalIn: '08:57', typicalOut: '11:18', planWindow: '08:00–17:00', ...overrides,
  })
  const late = () => cell(1, W1, { edit: { plan: false, confirm: true, recorded: true, locked_reason: 'recorded' }, actual: { status: 'anomaly', attendance_id: 55, late_minutes: 57, early_leave_minutes: 342, punch_in: `${W1}T08:57:00`, punch_out: `${W1}T11:18:00` } })

  it('這格符合整月固定型態：頂端寫出型態與修法、連到設定檢查／員工資料／重算，接受扣款前會提醒', async () => {
    att.getAnomalyList.mockResolvedValue({ data: { total: 0, pending: 0, confirmed: 0, items: [] } })
    const w = mount(PersonDayDrawer, {
      props: {
        modelValue: true, cell: late(), employee: employee(1, '林班導'), day: day(W1), groupLabel: '滿天星', shiftTypes: SHIFTS,
        sameDayCells: [], employeeNames: { 1: '林班導' }, weeklyShiftId: null, today: '2026-09-21', caller: CALLER,
        pattern: offset(), patternMatchesDay: true,
      },
      global: { plugins: [ElementPlus], stubs: { RouterLink: RouterLinkStub, ElDrawer: { props: ['modelValue'], template: '<section v-if="modelValue"><slot /></section>' } } },
    })
    await flushPromises()
    const banner = w.get('[data-test="pdd-pattern"]')
    expect(banner.text()).toContain('時段可能設錯')
    expect(banner.text()).toContain('不要逐格接受扣款')
    await banner.get('[data-test="pdd-pattern-list"]').trigger('click')
    await banner.get('[data-test="pdd-pattern-recalc"]').trigger('click')
    expect(w.emitted('patterns')).toHaveLength(1)
    expect(w.emitted('recalculate')).toHaveLength(1)
    await banner.get('[data-test="pdd-pattern-employee"]').trigger('click')
    await flushPromises()
    expect(router.push).toHaveBeenCalledWith('/employees/1')
    expect(w.findComponent(ResolveCard).props('acceptWarning')).toContain('林班導 本月')
  })

  it('同一人不是型態的那幾格（或沒有型態）不提醒', async () => {
    att.getAnomalyList.mockResolvedValue({ data: { total: 0, pending: 0, confirmed: 0, items: [] } })
    const base = {
      modelValue: true, cell: late(), employee: employee(1, '林班導'), day: day(W1), groupLabel: '滿天星', shiftTypes: SHIFTS,
      sameDayCells: [], employeeNames: { 1: '林班導' }, weeklyShiftId: null, today: '2026-09-21', caller: CALLER,
    }
    const global = { plugins: [ElementPlus], stubs: { RouterLink: RouterLinkStub, ElDrawer: { props: ['modelValue'], template: '<section v-if="modelValue"><slot /></section>' } } }
    const other = mount(PersonDayDrawer, { props: { ...base, pattern: offset(), patternMatchesDay: false }, global })
    const none = mount(PersonDayDrawer, { props: base, global })
    await flushPromises()
    expect(other.find('[data-test="pdd-pattern"]').exists()).toBe(false)
    expect(other.findComponent(ResolveCard).props('acceptWarning')).toBeNull()
    expect(none.find('[data-test="pdd-pattern"]').exists()).toBe(false)
  })

  it('全天請假的日子：確認當日班別預設收起（不出現必填的班別與原因）', async () => {
    const w = mountDrawer(cell(1, W1, { edit: { plan: false, confirm: true, recorded: true, locked_reason: 'recorded' }, leaves: [{ leave_type_label: '病假', is_full_day: true, status: 'approved' }], actual: { status: 'leave', attendance_id: 9 } }))
    await flushPromises()
    expect(w.find('[data-test="pdd-confirm-toggle"]').exists()).toBe(true)
    expect(w.find('textarea[data-test="pdd-confirm-reason"]').exists()).toBe(false)
  })
})
