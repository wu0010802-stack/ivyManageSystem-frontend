import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Panel from '../ReconciliationPanel.vue'
const api = vi.hoisted(() => ({ preview: vi.fn(), confirm: vi.fn() }))
vi.mock('@/api/attendanceReconciliation', () => ({ previewReconciliation: api.preview, confirmReconciliationShift: api.confirm }))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))
const shifts = [
  { shift_type_id: 1, name: '早班', work_start: '07:00', work_end: '16:00' },
  { shift_type_id: 2, name: '晚班', work_start: '08:00', work_end: '17:00' },
]
const row = (id: number) => ({ employee_id: id, employee_name: `測試員工${id}`, employee_number: `T${id}`, date: '2026-08-03',
  punch_in: `2026-08-03T0${id === 1 ? 8 : 7}:00:00`, punch_out: `2026-08-03T${id === 1 ? 17 : 16}:00:00`,
  expected_start: id === 1 ? '07:00' : '08:00', expected_end: id === 1 ? '16:00' : '17:00', original_shift_type_id: id,
  day_off: false, status: 'possible_shift_change', reason: '兩卡接近另一班別', candidates: [shifts[id === 1 ? 1 : 0]], version: String(id).repeat(64) })
const coverage = (overrides: Partial<{ covered_dates: string[]; batches: unknown[] }> = {}) => ({
  covered_dates: overrides.covered_dates ?? [],
  batches: overrides.batches ?? [],
})
let wrapper: ReturnType<typeof mount<typeof Panel>>
const button = (text: string) => wrapper.findAll('button').find(item => item.text() === text)!
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-09-06T12:00:00+08:00'))
  vi.resetAllMocks()
  api.preview.mockResolvedValue({ data: { rows: [row(1), row(2)], shift_types: shifts, coverage: coverage() } })
  api.confirm.mockResolvedValue({ data: { message: '已確認', updated_count: 2 } })
  wrapper = mount(Panel, { props: { year: 2026, month: 8, revision: 0 }, global: { plugins: [ElementPlus], stubs: { teleport: true, ElDialog: { name: 'ElDialog', props: ['modelValue'], template: '<section v-if="modelValue" role="dialog"><slot /><slot name="footer" /></section>' } } } })
})
afterEach(() => { wrapper.unmount(); vi.useRealTimers() })
describe('核對清單互動', () => {
  it('日期快捷維持選定月份，本週只涵蓋週一至今日', async () => {
    await flushPromises()
    expect(button('今日').attributes('disabled')).toBeDefined()
    expect(button('整月').exists()).toBe(true)
    await wrapper.setProps({ month: 9 }); await flushPromises()
    await button('今日').trigger('click'); await flushPromises()
    expect(api.preview.mock.lastCall?.[0]).toMatchObject({ start_date: '2026-09-06', end_date: '2026-09-06' })
    await button('本週迄今').trigger('click'); await flushPromises()
    expect(api.preview.mock.lastCall?.[0]).toMatchObject({ start_date: '2026-09-01', end_date: '2026-09-06' })
  })
  it('自訂超過31天不送出預覽並顯示原因', async () => {
    await flushPromises()
    const calls = api.preview.mock.calls.length
    await wrapper.find('input[aria-label="核對起日"]').setValue('2026-07-01')
    await button('重新核對').trigger('click'); await flushPromises()
    expect(api.preview).toHaveBeenCalledTimes(calls)
    expect(wrapper.text()).toContain('核對範圍不可超過 31 天')
  })

  it('資料待補按人員摺疊並與異常分開計數，搜尋後仍可逐日匯入', async () => {
    api.preview.mockResolvedValue({ data: { rows: [
      { ...row(1), status: 'data_incomplete', punch_in: null, punch_out: null },
      { ...row(1), date: '2026-08-04', status: 'data_incomplete', punch_in: null, punch_out: null },
      row(2),
    ], shift_types: shifts, coverage: coverage() } })
    await button('重新核對').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('資料待補 2 筆')
    expect(wrapper.text()).toContain('出勤差異 1 筆')
    const group = wrapper.find('details[data-employee-id="1"]')
    expect(group.exists()).toBe(true)
    expect(group.attributes('open')).toBeUndefined()
    expect(group.find('summary').text()).toContain('2 天資料待補')
    expect(wrapper.findAll('article').filter(item => !item.element.closest('details'))).toHaveLength(1)
    await wrapper.find('input[aria-label="搜尋核對人員"]').setValue('T1')
    ;(group.element as HTMLDetailsElement).open = true
    await group.trigger('toggle')
    await group.findAll('button').find(item => item.text() === '匯入打卡')!.trigger('click')
    expect(wrapper.emitted('import')?.[0]?.[0]).toMatchObject({ employee_id: 1, date: '2026-08-03' })
    await wrapper.setProps({ revision: 1 }); await flushPromises()
    expect(wrapper.find('details[data-employee-id="1"]').attributes('open')).toBeDefined()
  })

  it('核對請求只送日期區間，完整性由系統判定，不再由前端宣告', async () => {
    await flushPromises()
    expect(api.preview.mock.calls[0][0]).toEqual({ start_date: '2026-08-01', end_date: '2026-08-31' })
    await button('重新核對').trigger('click'); await flushPromises()
    expect(api.preview.mock.lastCall?.[0]).toEqual({ start_date: '2026-08-01', end_date: '2026-08-31' })
  })
  it('更改日期使舊建議失效，需重新核對才顯示新結果', async () => {
    await flushPromises()
    expect(wrapper.findAll('article').length).toBeGreaterThan(0)
    await wrapper.find('input[aria-label="核對起日"]').setValue('2026-08-02')
    expect(wrapper.findAll('article')).toHaveLength(0)
  })
  it('再次匯入（revision 變更）重新取得結果，保留自訂期間與人員搜尋', async () => {
    await flushPromises()
    await wrapper.find('input[aria-label="搜尋核對人員"]').setValue('T1')
    await wrapper.find('input[aria-label="核對起日"]').setValue('2026-08-02')
    await button('重新核對').trigger('click'); await flushPromises()
    await wrapper.setProps({ revision: 1 }); await flushPromises()
    expect(api.preview.mock.lastCall?.[0].start_date).toBe('2026-08-02')
    expect((wrapper.find('input[aria-label="搜尋核對人員"]').element as HTMLInputElement).value).toBe('T1')
    expect(api.preview.mock.lastCall?.[0]).not.toHaveProperty('complete_start_date')
  })
  it('兩人互換須勾選對象後一次送出兩個版本與原因', async () => {
    await flushPromises()
    await button('確認當日班別').trigger('click'); await flushPromises()
    expect(wrapper.findComponent({ name: 'ElDialog' }).props('modelValue')).toBe(true)
    expect(wrapper.text()).toContain('一併確認 測試員工2')
    await wrapper.findAll('input[type="checkbox"]')[0].setValue(true)
    await wrapper.find('textarea').setValue('已與兩位員工確認同日換班')
    await button('確認並重算').trigger('click'); await flushPromises()
    expect(api.confirm.mock.lastCall?.[0]).toEqual({ items: [
      { employee_id: 1, date: '2026-08-03', shift_type_id: 2, day_off: false, version: '1'.repeat(64) },
      { employee_id: 2, date: '2026-08-03', shift_type_id: 1, day_off: false, version: '2'.repeat(64) },
    ], reason: '已與兩位員工確認同日換班' })
    expect(wrapper.emitted('confirmed')).toHaveLength(1)
  })
})

describe('系統判定涵蓋顯示（2026-09-10 改版，取代人工勾選）', () => {
  it('沒有任何批次或 kiosk 紀錄時顯示尚未涵蓋，且不出現涵蓋明細按鈕', async () => {
    await flushPromises()
    expect(wrapper.find('.reconciliation__coverage').text()).toContain('打卡資料尚未涵蓋任何一天')
    expect(wrapper.find('.reconciliation__coverage--none').exists()).toBe(true)
    expect(wrapper.find('.reconciliation__coverage-toggle').exists()).toBe(false)
  })

  it('部分涵蓋時顯示已涵蓋天數，可展開匯入批次明細', async () => {
    api.preview.mockResolvedValue({ data: { rows: [row(1), row(2)], shift_types: shifts, coverage: coverage({
      covered_dates: Array.from({ length: 9 }, (_, i) => `2026-08-0${i + 1}`),
      batches: [{ source: 'excel', date_from: '2026-08-01', date_to: '2026-08-09', row_count: 312, imported_at: '2026-08-10T08:41:00', imported_by: 'admin' }],
    }) } })
    await button('重新核對').trigger('click'); await flushPromises()
    expect(wrapper.find('.reconciliation__coverage').text()).toContain('9／31')
    expect(wrapper.find('.reconciliation__coverage--none').exists()).toBe(false)
    expect(wrapper.find('.reconciliation__coverage-detail').exists()).toBe(false)
    await wrapper.find('.reconciliation__coverage-toggle').trigger('click')
    const detail = wrapper.find('.reconciliation__coverage-detail')
    expect(detail.text()).toContain('Excel 匯入')
    expect(detail.text()).toContain('312 筆')
    expect(detail.text()).toContain('admin')
  })

  it('全部天數皆涵蓋時顯示已涵蓋全部', async () => {
    api.preview.mockResolvedValue({ data: { rows: [row(1), row(2)], shift_types: shifts, coverage: coverage({
      covered_dates: Array.from({ length: 31 }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`),
      batches: [{ source: 'csv', date_from: '2026-08-01', date_to: '2026-08-31', row_count: 900, imported_at: '2026-08-31T18:00:00', imported_by: null }],
    }) } })
    await button('重新核對').trigger('click'); await flushPromises()
    expect(wrapper.find('.reconciliation__coverage').text()).toContain('已涵蓋全部 31 天')
  })
})
