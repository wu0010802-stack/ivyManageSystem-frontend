import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createMemoryHistory, createRouter } from 'vue-router'
import PortalAttendanceConfirmView from '@/views/portal/PortalAttendanceConfirmView.vue'

const api = vi.hoisted(() => ({ get: vi.fn(), respond: vi.fn(), signoff: vi.fn(), pendingCount: vi.fn() }))
vi.mock('@/api/portalAttendanceConfirm', () => ({
  getMyAttendanceConfirmations: api.get,
  respondAttendanceConfirmation: api.respond,
  signoffAttendanceMonth: api.signoff,
  getAttendanceConfirmPendingCount: api.pendingCount,
}))
vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus')
  return { ...actual, ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }
})

const BUS = { shift_type_id: 1, name: '早車', work_start: '07:00', work_end: '16:30' }
const LATE = { shift_type_id: 2, name: '晚車', work_start: '08:30', work_end: '18:00' }
function item(over: Record<string, unknown> = {}) {
  return {
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
    employee_response: 'pending', partner_response: 'pending', resolution: null, status: 'pending',
    escalated: false, linked_leave_id: null, linked_punch_correction_id: null, initiated_by: 'system',
    applied_at: null, my_role: 'employee', needs_my_response: true, can_agree: true, can_repair: true,
    ...over,
  }
}
function view(
  items: ReturnType<typeof item>[],
  pending: number,
  signedAt: string | null = null,
  extra: Record<string, unknown> = {},
) {
  return {
    data: {
      year: 2026, month: 9, items, pending_count: pending, signed_at: signedAt,
      participant: true, absence_days: [], ...extra,
    },
  }
}
function absenceDay(over: Record<string, unknown> = {}) {
  return {
    date: '2026-09-03', shift_name: '早車', expected_start: '07:00', expected_end: '16:30',
    pending_leave_id: null, pending_punch_correction_id: null, ...over,
  }
}

let wrapper: VueWrapper
async function mountView(query = '?year=2026&month=9') {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/portal/attendance-confirm', component: PortalAttendanceConfirmView },
    { path: '/portal/anomalies', component: { template: '<div />' } },
    { path: '/portal/leave', component: { template: '<div />' } },
    { path: '/portal/punch-correction', component: { template: '<div />' } },
  ] })
  await router.push(`/portal/attendance-confirm${query}`)
  wrapper = mount(PortalAttendanceConfirmView, { global: { plugins: [ElementPlus, router] }, attachTo: document.body })
  await flushPromises()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-02T10:00:00+08:00'))
  Object.values(api).forEach((fn) => fn.mockReset())
})
afterEach(() => {
  wrapper?.unmount()
  vi.useRealTimers()
})

describe('PortalAttendanceConfirmView', () => {
  it('describes the suggestion and agrees', async () => {
    api.get.mockResolvedValue(view([item()], 1))
    api.respond.mockResolvedValue({ data: item({ employee_response: 'agree', needs_my_response: false }) })
    await mountView()
    expect(api.get).toHaveBeenCalledWith({ year: 2026, month: 9 })
    // 網址有合法 year／month 時照舊優先，不必再問最早待回覆月份
    expect(api.pendingCount).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('推測：與 張副導（晚車）對調')
    await wrapper.get('[data-test="agree-11"]').trigger('click')
    await flushPromises()
    expect(api.respond).toHaveBeenCalledWith(11, { action: 'agree' })
    expect(wrapper.find('[data-test="agree-11"]').exists()).toBe(false)
  })

  it('amends as other with a note', async () => {
    api.get.mockResolvedValue(view([item()], 1))
    api.respond.mockResolvedValue({ data: item({ status: 'disputed', needs_my_response: false }) })
    await mountView()
    await wrapper.get('[data-test="amend-11"]').trigger('click')
    await wrapper.get('[data-test="amend-kind-other"]').trigger('click')
    // el-input(type=textarea) 用 inheritAttrs:false + useAttrs() 把 data-test 直接掛在
    // <textarea> 本身（不是外層 wrapper div），本專案安裝的 element-plus 2.13.2 皆如此；
    // 故選擇器不加 `textarea` 子代組合。斷言意圖（找到那顆 textarea 並輸入文字）不變。
    await wrapper.get('[data-test="amend-note-11"]').setValue('那天是園務會議')
    await wrapper.get('[data-test="amend-submit-11"]').trigger('click')
    await flushPromises()
    expect(api.respond).toHaveBeenCalledWith(11, { action: 'amend', amend: { kind: 'other', note: '那天是園務會議' } })
  })

  it('hides agree for items without a partner', async () => {
    api.get.mockResolvedValue(view([item({ kind: 'shift_changed', partner_employee_id: null, partner_name: null, can_agree: false })], 1))
    await mountView()
    expect(wrapper.find('[data-test="agree-11"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="amend-11"]').exists()).toBe(true)
  })

  it('enables sign-off only when nothing is pending', async () => {
    api.get.mockResolvedValue(view([item({ needs_my_response: false, status: 'agreed' })], 0))
    api.signoff.mockResolvedValue({ data: { year: 2026, month: 9, signed_at: '2026-10-02T10:00:00', round_id: 7 } })
    await mountView()
    const button = wrapper.get('[data-test="signoff"]')
    expect(button.attributes('disabled')).toBeUndefined()
    await button.trigger('click')
    await flushPromises()
    expect(api.signoff).toHaveBeenCalledWith({ year: 2026, month: 9 })
    expect(wrapper.text()).toContain('已完成本月出勤確認')
  })

  it('shows an empty state and still allows sign-off', async () => {
    api.get.mockResolvedValue(view([], 0))
    await mountView()
    expect(wrapper.text()).toContain('本月沒有需要確認的換班或代班')
    expect(wrapper.get('[data-test="signoff"]').attributes('disabled')).toBeUndefined()
  })

  it('disables sign-off while items are pending', async () => {
    api.get.mockResolvedValue(view([item()], 1))
    await mountView()
    expect(wrapper.get('[data-test="signoff"]').attributes('disabled')).toBeDefined()
  })

  it('discards a stale month response that resolves after a newer one (race guard)', async () => {
    let resolveSept!: (v: unknown) => void
    const septPromise = new Promise((resolve) => { resolveSept = resolve })
    api.get.mockImplementationOnce(() => septPromise)
    api.get.mockImplementationOnce(() => Promise.resolve(view([item({ id: 22, date: '2026-10-05' })], 1)))
    await mountView()

    const monthSelect = wrapper.findAllComponents({ name: 'ElSelect' })[1]
    await monthSelect.vm.$emit('update:modelValue', 10)
    await flushPromises()
    // 較慢的 9 月請求在 10 月請求之後才 resolve；沒有序號防護會把 9 月資料蓋掉已顯示的 10 月
    resolveSept(view([item({ id: 11 })], 1))
    await flushPromises()

    expect(api.get).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-test="agree-22"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="agree-11"]').exists()).toBe(false)
  })

  it('locks the 對 button while a response is in flight, preventing a double-submit', async () => {
    api.get.mockResolvedValue(view([item()], 1))
    let resolveRespond!: (v: unknown) => void
    api.respond.mockImplementation(() => new Promise((resolve) => { resolveRespond = resolve }))
    await mountView()

    const button = wrapper.get('[data-test="agree-11"]')
    await button.trigger('click')
    await button.trigger('click')
    expect(api.respond).toHaveBeenCalledTimes(1)

    resolveRespond({ data: item({ employee_response: 'agree', needs_my_response: false }) })
    await flushPromises()
    expect(wrapper.find('[data-test="agree-11"]').exists()).toBe(false)
  })

  it('treats invalid route query year/month like no query (last month when nothing is pending)', async () => {
    api.get.mockResolvedValue(view([], 0))
    api.pendingCount.mockResolvedValue({ data: { pending_count: 0, earliest_month: null } })
    await mountView('?year=abc&month=13')
    // fake system time 為 2026-10-02（Asia/Taipei）；月底確認在次月進行，預設上個月＝2026 年 9 月
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith({ year: 2026, month: 9 })
  })

  it('lands on the earliest month still awaiting my response when the URL has no year/month', async () => {
    api.get.mockResolvedValue(view([item({ date: '2026-08-20' })], 1))
    api.pendingCount.mockResolvedValue({ data: { pending_count: 3, earliest_month: '2026-08' } })
    await mountView('')
    expect(api.pendingCount).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith({ year: 2026, month: 8 })
  })

  it('defaults to last month when nothing is awaiting my response', async () => {
    api.get.mockResolvedValue(view([], 0))
    api.pendingCount.mockResolvedValue({ data: { pending_count: 0, earliest_month: null } })
    await mountView('')
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith({ year: 2026, month: 9 })
  })

  it('defaults to December of last year in January', async () => {
    vi.setSystemTime(new Date('2027-01-05T10:00:00+08:00'))
    api.get.mockResolvedValue(view([], 0))
    api.pendingCount.mockResolvedValue({ data: { pending_count: 0, earliest_month: null } })
    await mountView('')
    expect(api.get).toHaveBeenCalledWith({ year: 2026, month: 12 })
  })

  it('still loads last month when the pending-count lookup fails', async () => {
    api.get.mockResolvedValue(view([], 0))
    api.pendingCount.mockRejectedValue(new Error('network'))
    await mountView('')
    expect(api.get).toHaveBeenCalledWith({ year: 2026, month: 9 })
  })

  it('asks the sidebar badge to refetch after a reply and after sign-off', async () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent')
    api.get.mockResolvedValue(view([item()], 1))
    api.respond.mockResolvedValue({ data: item({ employee_response: 'agree', needs_my_response: false }) })
    api.signoff.mockResolvedValue({ data: { year: 2026, month: 9, signed_at: '2026-10-02T10:00:00', round_id: 7 } })
    await mountView()
    const fired = () => dispatch.mock.calls.filter(([e]) => e.type === 'portal-attendance-confirm-count-changed').length
    await wrapper.get('[data-test="agree-11"]').trigger('click')
    await flushPromises()
    expect(fired()).toBe(1)
    await wrapper.get('[data-test="signoff"]').trigger('click')
    await flushPromises()
    expect(fired()).toBe(2)
    dispatch.mockRestore()
  })

  it('disables signoff before month end (Task 8 #5/#6)', async () => {
    api.get.mockResolvedValue(view([], 0))
    await mountView('?year=2026&month=10')
    const button = wrapper.get('[data-test="signoff"]')
    expect(button.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('月底後才能簽認本月出勤')
  })

  it('enables signoff for ended month (Task 8 #5)', async () => {
    api.get.mockResolvedValue(view([], 0))
    await mountView('?year=2026&month=9')
    const button = wrapper.get('[data-test="signoff"]')
    expect(button.attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).not.toContain('月底後才能簽認本月出勤')
  })

  it('hides signoff for non-participant (Task 8 #6)', async () => {
    api.get.mockResolvedValue(view([], 0, null, { participant: false }))
    await mountView()
    expect(wrapper.text()).toContain('不需要做出勤確認')
    expect(wrapper.find('[data-test="signoff"]').exists()).toBe(false)
  })

  it('lists absence days with links (Task 8 #1)', async () => {
    api.get.mockResolvedValue(view([], 0, null, {
      absence_days: [
        absenceDay({ date: '2026-09-03' }),
        absenceDay({ date: '2026-09-10', pending_leave_id: 9 }),
      ],
    }))
    await mountView()
    const openRow = wrapper.get('[data-test="absence-day-2026-09-03"]')
    expect(openRow.text()).toContain('9/3（原班早車 07:00–16:30）')
    expect(openRow.text()).toContain('去請假')
    expect(openRow.text()).toContain('去補卡')
    expect(wrapper.find('a[href="/portal/leave"]').exists()).toBe(true)
    expect(wrapper.find('a[href="/portal/punch-correction"]').exists()).toBe(true)

    const pendingRow = wrapper.get('[data-test="absence-day-2026-09-10"]')
    expect(pendingRow.text()).toContain('請假審核中')
    expect(pendingRow.text()).not.toContain('去請假')
  })

  it('year options include the landing year (Task 8 #1)', async () => {
    api.get.mockResolvedValue(view([], 0))
    api.pendingCount.mockResolvedValue({ data: { pending_count: 1, earliest_month: '2024-05', eligible: true } })
    await mountView('')
    const yearSelect = wrapper.findAllComponents({ name: 'ElSelect' })[0]
    const labels = yearSelect.findAllComponents({ name: 'ElOption' }).map((o) => o.props('label'))
    expect(labels).toContain('2024 年')
  })

  it('cover partner sees leave-oriented copy (Task 8 #1)', async () => {
    api.get.mockResolvedValue(view([item({ kind: 'cover', my_role: 'partner' })], 1))
    await mountView()
    expect(wrapper.get('[data-test="amend-11"]').text()).toBe('補請假或其他…')
  })
})

describe('PortalAttendanceConfirmView 老師補登項目（SPEC-026 3-3）', () => {
  const reported = (id: number, name: string, original: typeof BUS) => ({
    employee_id: id, employee_name: name, status: 'reported', punch_in: null, punch_out: null,
    expected_start: original.work_start, expected_end: original.work_end, original,
  })
  const backdated = (over: Record<string, unknown> = {}) =>
    item({
      id: 31, round_id: null, initiated_by: 'employee', can_repair: false, my_role: 'partner',
      needs_my_response: true, employee_response: 'agree', partner_response: 'pending',
      suggestion: {
        confidence: 'teacher',
        parties: { '10': reported(10, '王副導', BUS), '20': reported(20, '張副導', LATE) },
        proposed: [{ employee_id: 10, shift: LATE }, { employee_id: 20, shift: BUS }],
        partner_options: [], shift_candidates: [], leave_missing: false,
        initiator_employee_id: 10, note: '臨時對調',
      },
      ...over,
    })

  it('顯示「老師補登」標籤與補登文案，沒有打卡或推測字樣', async () => {
    api.get.mockResolvedValue(view([backdated()], 1))
    await mountView()
    const card = wrapper.get('.attendance-confirm__card')
    expect(card.text()).toContain('老師補登')
    expect(card.text()).toContain('補登換班：王副導改上晚車 08:30–18:00、你改上早車 07:00–16:30（王副導提出，原因：臨時對調）')
    expect(card.text()).not.toMatch(/打卡|推測/)
  })

  it('系統項目沒有「老師補登」標籤', async () => {
    api.get.mockResolvedValue(view([item()], 1))
    await mountView()
    expect(wrapper.text()).not.toContain('老師補登')
  })

  it('可以按「對」', async () => {
    api.get.mockResolvedValue(view([backdated()], 1))
    api.respond.mockResolvedValue({ data: backdated({ partner_response: 'agree', needs_my_response: false, status: 'agreed' }) })
    await mountView()
    await wrapper.get('[data-test="agree-31"]').trigger('click')
    await flushPromises()
    expect(api.respond).toHaveBeenCalledWith(31, { action: 'agree' })
  })

  it('不對：只剩「其他（請說明）」，沒有改配對、補請假、補卡選項，送出為 kind=other', async () => {
    api.get.mockResolvedValue(view([backdated()], 1))
    api.respond.mockResolvedValue({ data: backdated({ status: 'disputed', needs_my_response: false }) })
    await mountView()
    expect(wrapper.get('[data-test="amend-31"]').text()).toBe('不對，說明原因…')
    await wrapper.get('[data-test="amend-31"]').trigger('click')
    for (const k of ['swap_with', 'cover_for', 'leave', 'forgot_punch']) {
      expect(wrapper.find(`[data-test="amend-kind-${k}"]`).exists()).toBe(false)
    }
    await wrapper.get('[data-test="amend-kind-other"]').trigger('click')
    await wrapper.get('[data-test="amend-note-31"]').setValue('那天我沒有換')
    await wrapper.get('[data-test="amend-submit-31"]').trigger('click')
    await flushPromises()
    expect(api.respond).toHaveBeenCalledWith(31, { action: 'amend', amend: { kind: 'other', note: '那天我沒有換' } })
  })

  it('發起人自己的項目（已同意、等對方）：不顯示回覆按鈕', async () => {
    api.get.mockResolvedValue(view([backdated({ my_role: 'employee', needs_my_response: false, employee_response: 'agree' })], 0))
    await mountView()
    expect(wrapper.find('[data-test="agree-31"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="amend-31"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('補登換班')
  })
})

describe('PortalAttendanceConfirmView 忘了打卡只送對應那側（QA P3）', () => {
  it('先補全天填了兩側，再改補下班：送出不帶上班時間', async () => {
    api.get.mockResolvedValue(view([item()], 1))
    api.respond.mockResolvedValue({ data: item({ status: 'disputed', needs_my_response: false }) })
    await mountView()
    await wrapper.get('[data-test="amend-11"]').trigger('click')
    await wrapper.get('[data-test="amend-kind-forgot_punch"]').trigger('click')
    await flushPromises()
    const pickers = wrapper.findAllComponents({ name: 'ElTimePicker' })
    expect(pickers).toHaveLength(2)
    pickers[0].vm.$emit('update:modelValue', '07:00')
    pickers[1].vm.$emit('update:modelValue', '16:30')
    await flushPromises()
    const select = wrapper.findAllComponents({ name: 'ElSelect' }).find((s) => s.props('modelValue') === 'both')!
    select.vm.$emit('update:modelValue', 'punch_out')
    await flushPromises()
    await wrapper.get('[data-test="amend-submit-11"]').trigger('click')
    await flushPromises()
    expect(api.respond).toHaveBeenCalledWith(11, {
      action: 'amend',
      amend: { kind: 'forgot_punch', correction_type: 'punch_out', requested_punch_out: '2026-09-15T16:30:00' },
    })
  })
})
