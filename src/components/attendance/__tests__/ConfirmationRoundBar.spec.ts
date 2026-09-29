import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import ConfirmationRoundBar from '@/components/attendance/ConfirmationRoundBar.vue'

const api = vi.hoisted(() => ({
  list: vi.fn(), create: vi.fn(), get: vi.fn(), refresh: vi.fn(), apply: vi.fn(),
}))
const perm = vi.hoisted(() => ({ allow: true }))
vi.mock('@/api/attendanceConfirmation', () => ({
  listConfirmationRounds: api.list,
  createConfirmationRound: api.create,
  getConfirmationRound: api.get,
  refreshConfirmationRound: api.refresh,
  applyAgreedConfirmations: api.apply,
}))
vi.mock('@/utils/auth', () => ({ hasPermission: () => perm.allow }))

const BUS = { shift_type_id: 1, name: '早車', work_start: '07:00', work_end: '16:30' }
const LATE = { shift_type_id: 2, name: '晚車', work_start: '08:30', work_end: '18:00' }
const ROUND = {
  id: 7, period_start: '2026-09-01', period_end: '2026-09-30', deadline_date: '2026-10-07',
  status: 'open', released_by: 'admin', released_at: '2026-10-02T10:00:00', eligible_count: 2,
}
const ITEM = {
  id: 11, round_id: 7, employee_id: 10, employee_name: '王副導', partner_employee_id: 20,
  partner_name: '張副導', date: '2026-09-15', kind: 'swap',
  suggestion: {
    confidence: 'high',
    parties: {
      '10': { employee_id: 10, employee_name: '王副導', status: 'possible_shift_change', punch_in: '2026-09-15T08:31:00', punch_out: '2026-09-15T18:02:00', expected_start: '07:00', expected_end: '16:30', original: BUS },
      '20': { employee_id: 20, employee_name: '張副導', status: 'possible_shift_change', punch_in: '2026-09-15T07:01:00', punch_out: '2026-09-15T16:31:00', expected_start: '08:30', expected_end: '18:00', original: LATE },
    },
    proposed: [{ employee_id: 10, shift: LATE }, { employee_id: 20, shift: BUS }],
    partner_options: [], shift_candidates: [LATE], leave_missing: false,
  },
  employee_response: 'agree', partner_response: 'agree', resolution: null, status: 'agreed',
  escalated: false, linked_leave_id: null, linked_punch_correction_id: null, initiated_by: 'system', applied_at: null,
}
const PROGRESS = {
  round: ROUND,
  employees: [
    { employee_id: 10, employee_name: '王副導', item_count: 1, awaiting_response: 0, agreed: 1, disputed: 0, applied: 0, escalated: false, signed: true },
    { employee_id: 20, employee_name: '張副導', item_count: 1, awaiting_response: 1, agreed: 0, disputed: 0, applied: 0, escalated: true, signed: false },
  ],
  items: [ITEM],
}

let wrapper: VueWrapper
const stubs = {
  teleport: true,
  ElDialog: { name: 'ElDialog', props: ['modelValue'], template: '<section v-if="modelValue" role="dialog"><slot /><slot name="footer" /></section>' },
  ElDrawer: { name: 'ElDrawer', props: ['modelValue'], template: '<aside v-if="modelValue"><slot /></aside>' },
}

function mountBar() {
  wrapper = mount(ConfirmationRoundBar, {
    props: { start: '2026-09-01', end: '2026-09-30' },
    global: { plugins: [ElementPlus], stubs },
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-02T10:00:00+08:00'))
  perm.allow = true
  Object.values(api).forEach((fn) => fn.mockReset())
})
afterEach(() => {
  wrapper?.unmount()
  vi.useRealTimers()
})

describe('ConfirmationRoundBar', () => {
  it('previews then releases a round when none exists', async () => {
    api.list.mockResolvedValue({ data: [] })
    api.create.mockResolvedValueOnce({ data: { round: null, items: [ITEM], eligible_count: 2 } })
    mountBar()
    await flushPromises()
    await wrapper.get('[data-test="open-create"]').trigger('click')
    await wrapper.get('[data-test="preview"]').trigger('click')
    await flushPromises()
    expect(api.create).toHaveBeenCalledWith({
      period_start: '2026-09-01', period_end: '2026-09-30', deadline_date: '2026-10-07', dry_run: true,
    })
    expect(wrapper.get('[data-test="draft"]').text()).toContain('預計 1 筆待確認項目')
    api.create.mockResolvedValueOnce({ data: { round: ROUND, items: [ITEM], eligible_count: 2 } })
    api.list.mockResolvedValue({ data: [ROUND] })
    api.get.mockResolvedValue({ data: PROGRESS })
    await wrapper.get('[data-test="release"]').trigger('click')
    await flushPromises()
    expect(api.create).toHaveBeenLastCalledWith(expect.objectContaining({ dry_run: false }))
    expect(wrapper.get('[data-test="round-summary"]').text()).toContain('確認輪次 #7')
  })

  it('invalidates the previewed draft and disables release once the form changes without re-previewing', async () => {
    api.list.mockResolvedValue({ data: [] })
    api.create.mockResolvedValueOnce({ data: { round: null, items: [ITEM], eligible_count: 2 } })
    mountBar()
    await flushPromises()
    await wrapper.get('[data-test="open-create"]').trigger('click')
    await wrapper.get('[data-test="preview"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-test="draft"]').exists()).toBe(true)
    expect(wrapper.get('[data-test="release"]').attributes('disabled')).toBeUndefined()

    // 改動表單其中一欄（用真實 ElDatePicker 驅動 v-model，而非直改元件內部 state）；
    // 預覽後改表單卻沒重新預覽，發送不可再送出剛才預覽以外的內容。
    const periodStartPicker = wrapper.findAllComponents({ name: 'ElDatePicker' })[0]
    await periodStartPicker.vm.$emit('update:modelValue', '2026-09-02')
    await flushPromises()

    expect(wrapper.find('[data-test="draft"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="release"]').attributes('disabled')).toBeDefined()
    expect(api.create).not.toHaveBeenCalledWith(expect.objectContaining({ dry_run: false }))
  })

  it('shows progress, emits items and applies agreed items after a dry run', async () => {
    api.list.mockResolvedValue({ data: [ROUND] })
    api.get.mockResolvedValue({ data: PROGRESS })
    api.apply
      .mockResolvedValueOnce({ data: { planned: [{ item_id: 11, date: '2026-09-15', kind: 'swap', changes: [{ employee_id: 10, employee_name: '王副導', from_shift: BUS, to_shift: LATE }] }], applied: [], skipped: [], superseded: [], failed: [] } })
      .mockResolvedValueOnce({ data: { planned: [], applied: [11], skipped: [], superseded: [], failed: [] } })
    mountBar()
    await flushPromises()
    const summary = wrapper.get('[data-test="round-summary"]').text()
    expect(summary).toContain('待回覆 1 人')
    expect(summary).toContain('逾期 1 人')
    expect(summary).toContain('已簽認 1/2')
    expect(wrapper.emitted('items')?.at(-1)?.[0]).toEqual([ITEM])
    await wrapper.get('[data-test="plan-apply"]').trigger('click')
    await flushPromises()
    // 預覽只含本輪 agreed 項目（與按鈕計數一致，最終審查 M-1）
    expect(api.apply).toHaveBeenNthCalledWith(1, { dry_run: true, item_ids: [11] })
    expect(wrapper.get('[data-test="apply-plan"]').text()).toContain('王副導 早車 → 晚車')
    await wrapper.get('[data-test="confirm-apply"]').trigger('click')
    await flushPromises()
    expect(api.apply).toHaveBeenNthCalledWith(2, { dry_run: false, item_ids: [11] })
  })

  it('previews apply with only this round\'s agreed item ids, matching the button count', async () => {
    const pendingItem = { ...ITEM, id: 12, status: 'pending', employee_response: 'agree', partner_response: 'pending' }
    const secondAgreed = { ...ITEM, id: 13, date: '2026-09-16' }
    api.list.mockResolvedValue({ data: [ROUND] })
    api.get.mockResolvedValue({ data: { ...PROGRESS, items: [ITEM, pendingItem, secondAgreed] } })
    api.apply.mockResolvedValueOnce({ data: { planned: [], applied: [], skipped: [], superseded: [], failed: [] } })
    mountBar()
    await flushPromises()
    expect(wrapper.get('[data-test="plan-apply"]').text()).toContain('套用雙方已確認（2）')
    await wrapper.get('[data-test="plan-apply"]').trigger('click')
    await flushPromises()
    expect(api.apply).toHaveBeenCalledWith({ dry_run: true, item_ids: [11, 13] })
  })

  it('shows the teacher amendment note and linked leave / punch-correction ids in the progress drawer', async () => {
    const leaveItem = {
      ...ITEM, id: 21, kind: 'cover', status: 'disputed', employee_response: 'agree', partner_response: 'amend',
      resolution: { kind: 'leave', leave_type: 'personal', note: '家裡臨時有事', by_role: 'partner' },
      linked_leave_id: 31,
    }
    const punchItem = {
      ...ITEM, id: 22, status: 'disputed', employee_response: 'amend', partner_response: 'pending',
      resolution: { kind: 'forgot_punch', note: '忘了刷下班卡', by_role: 'employee' },
      linked_punch_correction_id: 42,
    }
    api.list.mockResolvedValue({ data: [ROUND] })
    api.get.mockResolvedValue({ data: { ...PROGRESS, items: [leaveItem, punchItem] } })
    mountBar()
    await flushPromises()
    await wrapper.get('[data-test="open-progress"]').trigger('click')
    await flushPromises()
    const rows = wrapper.findAll('[data-test="needs-admin-resolution"]')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('張副導的修正：補請假（事假）')
    expect(rows[0].text()).toContain('說明：家裡臨時有事')
    expect(rows[0].text()).toContain('已建立請假申請 #31')
    expect(rows[1].text()).toContain('說明：忘了刷下班卡')
    expect(rows[1].text()).toContain('已建立補卡申請 #42')
  })

  it('hides write actions without ATTENDANCE_WRITE', async () => {
    perm.allow = false
    api.list.mockResolvedValue({ data: [] })
    mountBar()
    await flushPromises()
    expect(wrapper.find('[data-test="open-create"]').exists()).toBe(false)
  })
})
