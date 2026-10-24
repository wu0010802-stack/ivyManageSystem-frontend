import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import RecalculateAttendanceDrawer from '../RecalculateAttendanceDrawer.vue'

const api = vi.hoisted(() => ({ recalc: vi.fn() }))
vi.mock('@/api/attendance', () => ({ recalculateAttendance: api.recalc }))
const message = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }))
vi.mock('element-plus', async (orig) => ({ ...(await orig<typeof import('element-plus')>()), ElMessage: message }))

const flags = (late = 0, early = 0, status = 'normal', inMiss = false, outMiss = false) => ({
  status, late_minutes: late, early_leave_minutes: early, is_missing_punch_in: inMiss, is_missing_punch_out: outMiss,
})

function preview(over: Record<string, unknown> = {}) {
  return {
    dry_run: true, year: 2026, month: 9, checked_rows: 40, changed_rows: 3, changed_employees: 2,
    results: [
      { employee_id: 7, employee_name: '呂麗珍', outcome: 'changed', code: null, confirmations_cleared: 1, skipped_days: [],
        changes: [
          { date: '2026-09-22', before: flags(26, 0, 'late'), after: flags() },
          { date: '2026-09-23', before: flags(26, 0, 'late'), after: flags(0, 15, 'early_leave') },
        ] },
      { employee_id: 8, employee_name: '王麗慧', outcome: 'changed', code: null, confirmations_cleared: 0,
        skipped_days: [{ date: '2026-09-24', code: 'USE_PTO' }],
        changes: [{ date: '2026-09-22', before: flags(0, 0, 'normal', false, true), after: flags(0, 0, 'normal') }] },
      { employee_id: 9, employee_name: '管理員本人', outcome: 'skipped', code: 'SELF', confirmations_cleared: 0, skipped_days: [], changes: [] },
      { employee_id: 10, employee_name: '陳芳宇', outcome: 'unchanged', code: null, confirmations_cleared: 0, skipped_days: [], changes: [] },
    ],
    ...over,
  }
}

function mountDrawer(props: Record<string, unknown> = {}) {
  return mount(RecalculateAttendanceDrawer, {
    props: { modelValue: true, year: 2026, month: 9, ...props },
    global: {
      plugins: [ElementPlus],
      stubs: {
        ElDrawer: {
          name: 'ElDrawer',
          props: ['modelValue', 'title'],
          emits: ['update:modelValue'],
          template: '<section v-if="modelValue"><h2>{{ title }}</h2><slot /><footer><slot name="footer" /></footer></section>',
        },
      },
    },
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  api.recalc.mockImplementation(async (body: { dry_run: boolean }) => ({ data: { ...preview(), dry_run: body.dry_run } }))
})

describe('RecalculateAttendanceDrawer', () => {
  it('打開就試算（dry_run）並寫出幾人幾天會改、每天改前改後、不會重算的人與日子', async () => {
    const wrapper = mountDrawer()
    await flushPromises()
    expect(api.recalc).toHaveBeenCalledWith({ year: 2026, month: 9, dry_run: true })
    expect(wrapper.text()).toContain('重算 9 月出勤')
    expect(wrapper.get('[data-test="recalc-summary"]').text()).toBe('2 人、3 天的遲到／早退／缺卡會改變。')
    const person = wrapper.get('[data-test="recalc-person-7"]')
    expect(person.text()).toContain('呂麗珍')
    expect(person.text()).toContain('2 天')
    expect(person.text()).toContain('1 天原本的接受扣款／豁免會失效')
    expect(person.text()).toContain('9/22：遲到 26 分 → 正常')
    expect(person.text()).toContain('9/23：遲到 26 分 → 早退 15 分')
    expect(wrapper.get('[data-test="recalc-person-8"]').text()).toContain('9/22：缺下班卡 → 正常')
    const skipped = wrapper.get('[data-test="recalc-skipped"]').text()
    expect(skipped).toContain('管理員本人：本人的出勤要由其他行政人員重算')
    expect(skipped).toContain('王麗慧 9/24：已用特休抵銷，需個別核查')
    // 沒有改變的人不列
    expect(wrapper.text()).not.toContain('陳芳宇')
    expect(wrapper.get('[data-test="recalc-apply"]').text()).toBe('確認重算 3 天')
  })

  it('停用員工、在職區間外的日子寫出原因；重算失敗的人另外列出', async () => {
    api.recalc.mockResolvedValue({ data: preview({ results: [
      { employee_id: 11, employee_name: '離職未填日', outcome: 'skipped', code: 'NOT_EMPLOYED', confirmations_cleared: 0, skipped_days: [], changes: [] },
      { employee_id: 12, employee_name: '新進員工', outcome: 'unchanged', code: null, confirmations_cleared: 0, skipped_days: [{ date: '2026-09-01', code: 'NOT_EMPLOYED' }], changes: [] },
      { employee_id: 13, employee_name: '鎖住的人', outcome: 'failed', code: 'ERROR', confirmations_cleared: 0, skipped_days: [], changes: [] },
    ] }) })
    const wrapper = mountDrawer()
    await flushPromises()
    const skipped = wrapper.get('[data-test="recalc-skipped"]').text()
    expect(skipped).toContain('離職未填日：已停用或不在在職區間')
    expect(skipped).toContain('新進員工 9/1：不在在職區間')
    expect(wrapper.get('[data-test="recalc-failed"]').text()).toContain('鎖住的人')
  })

  it('正式送出後有人失敗：提示哪些人要再試一次', async () => {
    const wrapper = mountDrawer()
    await flushPromises()
    api.recalc.mockResolvedValueOnce({ data: { ...preview(), dry_run: false, results: [
      ...preview().results,
      { employee_id: 13, employee_name: '鎖住的人', outcome: 'failed', code: 'ERROR', confirmations_cleared: 0, skipped_days: [], changes: [] },
    ] } })
    await wrapper.get('[data-test="recalc-apply"]').trigger('click')
    await flushPromises()
    expect(message.warning).toHaveBeenCalledWith(expect.stringContaining('鎖住的人'))
    expect(wrapper.emitted('done')).toHaveLength(1)
  })

  it('確認後正式送出、提示結果、通知頁面重抓並關閉', async () => {
    const wrapper = mountDrawer()
    await flushPromises()
    await wrapper.get('[data-test="recalc-apply"]').trigger('click')
    await flushPromises()
    expect(api.recalc).toHaveBeenLastCalledWith({ year: 2026, month: 9, dry_run: false })
    expect(message.success).toHaveBeenCalledWith('已重算 9 月出勤：3 天改變')
    expect(wrapper.emitted('done')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })

  it('都和目前設定一致：說不用重算，確認鈕停用', async () => {
    api.recalc.mockResolvedValue({ data: preview({ changed_rows: 0, changed_employees: 0, results: [] }) })
    const wrapper = mountDrawer()
    await flushPromises()
    expect(wrapper.get('[data-test="recalc-summary"]').text()).toBe('9 月已匯入的出勤都和目前的設定一致，不用重算。')
    expect(wrapper.get('[data-test="recalc-apply"]').attributes('disabled')).toBeDefined()
  })

  it('試算失敗：顯示錯誤可重試，確認鈕停用', async () => {
    api.recalc.mockRejectedValueOnce({ response: { status: 500, data: { detail: 'boom' } } })
    const wrapper = mountDrawer()
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.get('[data-test="recalc-apply"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-test="recalc-retry"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-test="recalc-summary"]').text()).toContain('3 天')
  })

  it('正式送出失敗：留在抽屜並提示，不通知重抓', async () => {
    const wrapper = mountDrawer()
    await flushPromises()
    api.recalc.mockRejectedValueOnce({ response: { status: 409, data: { detail: '該月份薪資已封存' } } })
    await wrapper.get('[data-test="recalc-apply"]').trigger('click')
    await flushPromises()
    expect(message.error).toHaveBeenCalled()
    expect(wrapper.emitted('done')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('關著不試算；換月份時重新試算', async () => {
    const closed = mountDrawer({ modelValue: false })
    await flushPromises()
    expect(api.recalc).not.toHaveBeenCalled()
    await closed.setProps({ modelValue: true })
    await flushPromises()
    expect(api.recalc).toHaveBeenCalledTimes(1)
    await closed.setProps({ month: 10 })
    await flushPromises()
    expect(api.recalc).toHaveBeenLastCalledWith({ year: 2026, month: 10, dry_run: true })
  })
})
