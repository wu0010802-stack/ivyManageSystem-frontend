import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import FieldBreakdownDrawer from '../FieldBreakdownDrawer.vue'
import type { SettlementRecord } from '@/composables/useSalarySettlement'

vi.mock('@/api/salary', () => ({ getSalaryFieldBreakdown: vi.fn() }))
import { getSalaryFieldBreakdown } from '@/api/salary'

const STUBS = {
  'el-drawer': { template: '<div class="drawer"><slot name="header" /><slot /><slot name="footer" /></div>' },
  'el-button': { props: ['disabled'], template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>' },
  'el-table': true,
  'el-table-column': true,
  'el-alert': { props: ['title'], template: '<div>{{ title }}</div>' },
  'router-link': { props: ['to'], template: '<a><slot /></a>' },
}

const rec = (over: Partial<SettlementRecord>): SettlementRecord => ({
  id: 1,
  employee_id: 11,
  employee_name: '甲',
  version: 1,
  gross_salary: 30000,
  net_salary: 28000,
  is_finalized: false,
  breakdown_stale: false,
  manual_overrides: [],
  base_salary: 30000,
  ...over,
})

const ROWS = [
  rec({ id: 1, employee_name: '甲', absence_deduction: 16102, labor_insurance: 955 }),
  rec({ id: 2, employee_name: '乙' }),
  rec({ id: 3, employee_name: '丙' }),
]

const mountDrawer = (props: Record<string, unknown> = {}) =>
  mount(FieldBreakdownDrawer, {
    props: { modelValue: true, row: ROWS[0], field: 'absence_deduction', navRows: ROWS, year: 2026, month: 10, ...props },
    global: { stubs: STUBS },
  })

describe('FieldBreakdownDrawer', () => {
  beforeEach(() => {
    vi.mocked(getSalaryFieldBreakdown).mockReset()
    vi.mocked(getSalaryFieldBreakdown).mockResolvedValue({
      data: { title: '曠職扣款明細', rows: [{ date: '2026-10-12' }], columns: [{ key: 'date', label: '日期' }], summary: { amount: 16102 } },
    } as never)
  })

  it('開啟即載入目前欄位，顯示合計', async () => {
    const w = mountDrawer()
    await flushPromises()
    expect(getSalaryFieldBreakdown).toHaveBeenCalledWith(1, 'absence_deduction')
    expect(w.text()).toContain('曠職扣款明細')
    expect(w.text()).toContain('NT$16,102')
  })

  it('關閉時不打 API', async () => {
    mountDrawer({ modelValue: false })
    await flushPromises()
    expect(getSalaryFieldBreakdown).not.toHaveBeenCalled()
  })

  it('頁籤只列本人有金額的可拆解項目；點了切欄位', async () => {
    const w = mountDrawer()
    await flushPromises()
    const tabs = w.findAll('[role="tab"]').map((t) => t.text())
    expect(tabs).toEqual(['底薪', '勞保', '曠職'])
    await w.findAll('[role="tab"]')[1].trigger('click')
    expect(w.emitted('update:field')?.[0]).toEqual(['labor_insurance'])
  })

  it('上一位／下一位在巡覽範圍內移動', async () => {
    const w = mountDrawer({ row: ROWS[1] })
    await flushPromises()
    expect(w.text()).toContain('2 / 3')
    const buttons = w.findAll('button').filter((b) => /上一位|下一位/.test(b.text()))
    await buttons[1].trigger('click')
    expect(w.emitted('update:row')?.[0]?.[0]).toMatchObject({ id: 3 })
  })

  it('出勤類扣款提供「到出勤核對處理」；其他欄位不顯示', async () => {
    const w = mountDrawer()
    await flushPromises()
    expect(w.text()).toContain('到出勤核對處理')
    const w2 = mountDrawer({ field: 'labor_insurance' })
    await flushPromises()
    expect(w2.text()).not.toContain('到出勤核對處理')
  })

  it('載入失敗顯示重試，不殘留舊資料', async () => {
    vi.mocked(getSalaryFieldBreakdown).mockRejectedValueOnce(new Error('500'))
    const w = mountDrawer()
    await flushPromises()
    expect(w.text()).toContain('明細載入失敗')
    expect(w.text()).not.toContain('曠職扣款明細')
  })

  it('切換到下一位時先清掉上一位的明細（載入中不露舊資料）', async () => {
    const w = mountDrawer()
    await flushPromises()
    expect(w.text()).toContain('曠職扣款明細')
    let release: (v: unknown) => void = () => {}
    vi.mocked(getSalaryFieldBreakdown).mockImplementationOnce(() => new Promise((r) => { release = r }) as never)
    await w.setProps({ row: ROWS[1] })
    expect(w.text()).not.toContain('曠職扣款明細')
    release({ data: { title: '底薪明細', rows: [], columns: [], summary: { amount: 30000 } } })
    await flushPromises()
    expect(w.text()).toContain('底薪明細')
  })

  // 自 staging 064bfdd75（覆核頁欄位明細請求序號守衛）移植：明細已改抽屜，守衛在抽屜內
  it('快速切換：舊請求晚到不得蓋掉新請求，新請求在飛時 loading 維持', async () => {
    const deferred = () => {
      let resolve!: (v: unknown) => void
      const promise = new Promise((r) => { resolve = r })
      return { promise, resolve }
    }
    const first = deferred()
    const second = deferred()
    vi.mocked(getSalaryFieldBreakdown).mockReset()
    vi.mocked(getSalaryFieldBreakdown)
      .mockReturnValueOnce(first.promise as never)
      .mockReturnValueOnce(second.promise as never)
    const w = mountDrawer()
    await w.setProps({ row: ROWS[1] })
    // 舊（第一位）先回：不得寫入，且新請求還在飛
    first.resolve({ data: { title: '舊明細', rows: [], columns: [], summary: { amount: 1 } } })
    await flushPromises()
    expect(w.text()).not.toContain('舊明細')
    expect((w.vm as unknown as { loading: boolean }).loading).toBe(true)
    second.resolve({ data: { title: '新明細', rows: [], columns: [], summary: { amount: 2 } } })
    await flushPromises()
    expect(w.text()).toContain('新明細')
    expect((w.vm as unknown as { loading: boolean }).loading).toBe(false)
  })
})
