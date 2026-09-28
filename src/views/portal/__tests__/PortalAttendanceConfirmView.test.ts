import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createMemoryHistory, createRouter } from 'vue-router'
import PortalAttendanceConfirmView from '@/views/portal/PortalAttendanceConfirmView.vue'

const api = vi.hoisted(() => ({ get: vi.fn(), respond: vi.fn(), signoff: vi.fn() }))
vi.mock('@/api/portalAttendanceConfirm', () => ({
  getMyAttendanceConfirmations: api.get,
  respondAttendanceConfirmation: api.respond,
  signoffAttendanceMonth: api.signoff,
  getAttendanceConfirmPendingCount: vi.fn(),
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
function view(items: ReturnType<typeof item>[], pending: number, signedAt: string | null = null) {
  return { data: { year: 2026, month: 9, items, pending_count: pending, signed_at: signedAt } }
}

let wrapper: VueWrapper
async function mountView(query = '?year=2026&month=9') {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/portal/attendance-confirm', component: PortalAttendanceConfirmView },
    { path: '/portal/anomalies', component: { template: '<div />' } },
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

  it('falls back to this month when the route query year/month are invalid', async () => {
    api.get.mockResolvedValue(view([], 0))
    await mountView('?year=abc&month=13')
    // fake system time 為 2026-10-02（Asia/Taipei），本月＝2026 年 10 月
    expect(api.get).toHaveBeenCalledWith({ year: 2026, month: 10 })
  })
})
