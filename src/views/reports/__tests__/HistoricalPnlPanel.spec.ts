import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { AxiosHeaders, type AxiosResponse } from 'axios'
import type { HistoricalPnlImport, HistoricalPnlPreview, HistoricalPnlYear } from '@/api/historicalPnl'

vi.mock('@/api/historicalPnl', () => ({ getHistoricalPnl: vi.fn(), previewHistoricalPnl: vi.fn(), importHistoricalPnl: vi.fn() }))
vi.mock('@/utils/auth', () => ({ hasPermission: vi.fn(() => true) }))
vi.mock('@/utils/adminSession', () => ({ onAdminSessionReset: vi.fn(() => vi.fn()) }))

import HistoricalPnlPanel from '../HistoricalPnlPanel.vue'
import { getHistoricalPnl, importHistoricalPnl, previewHistoricalPnl } from '@/api/historicalPnl'
import { hasPermission } from '@/utils/auth'
import { onAdminSessionReset } from '@/utils/adminSession'

function response<T>(data: T): AxiosResponse<T> {
  return { data, status: 200, statusText: 'OK', headers: {}, config: { headers: new AxiosHeaders() } }
}
function input(): HistoricalPnlImport {
  return {
    year: 2026, source_name: '合成測試.xlsx', source_sha256: 'a'.repeat(64), basis_note: '推估測試，現金實付未核對',
    months: [{ month: 1, revenue: '100.00', expense: '60.00', profit: '40.00', rows: [
      { key: 'income', label: '收入', section: 'income', role: 'total', parent_key: null, amount: '100.00', source_cell: '測試!B1', direct_flags: [] },
      { key: 'expense', label: '支出', section: 'expense', role: 'total', parent_key: null, amount: '60.00', source_cell: '測試!B2', direct_flags: [] },
      { key: 'profit', label: '損益', section: 'profit', role: 'total', parent_key: null, amount: '40.00', source_cell: '測試!B3', direct_flags: [] },
      { key: 'blank', label: '空白科目', section: 'expense', role: 'detail', parent_key: 'expense', amount: null, source_cell: '測試!B4', direct_flags: [] },
      { key: 'zero', label: '零額科目', section: 'expense', role: 'detail', parent_key: 'expense', amount: '0.00', source_cell: '測試!B5', direct_flags: [] },
    ] }],
  }
}
function yearData(): HistoricalPnlYear {
  const source = input()
  return {
    year: 2026, actual_status: 'unverified', totals: { revenue: '100.00', expense: '60.00', profit: '40.00' },
    months: source.months.map(month => ({
      ...month, revenue: '100.00', expense: '60.00', profit: '40.00',
      source_name: source.source_name, source_sha256: source.source_sha256, basis_note: source.basis_note,
      created_at: '2026-01-02T00:00:00', actual_status: 'unverified',
      rows: month.rows.map(row => ({ ...row, amount: row.amount == null ? null : String(row.amount), actual_status: 'unverified', inclusive_flags: row.key === 'expense' ? ['estimate'] : [] })),
    })),
  }
}
function preview(conflict = false): HistoricalPnlPreview {
  return { year: 2026, can_import: !conflict, insert_count: conflict ? 0 : 1, replay_count: 0, conflict_count: conflict ? 1 : 0,
    months: [{ month: 1, status: conflict ? 'conflict' : 'new', revenue: '100.00', expense: '60.00', profit: '40.00' }],
    totals: { revenue: '100.00', expense: '60.00', profit: '40.00' } }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
const wrappers: ReturnType<typeof mount>[] = []
function panel() {
  const wrapper = mount(HistoricalPnlPanel, { props: { year: 2026 }, global: { plugins: [ElementPlus] } })
  wrappers.push(wrapper)
  return wrapper
}
async function choose(wrapper: ReturnType<typeof panel>, text = JSON.stringify(input()), size?: number) {
  const file = new File([text], '合成測試.json', { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: async () => text })
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size })
  Object.defineProperty(wrapper.get('[data-test="historical-file"]').element, 'files', { value: [file], configurable: true })
  await wrapper.get('[data-test="historical-file"]').trigger('change')
  await flushPromises()
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(hasPermission).mockReturnValue(true)
  vi.mocked(onAdminSessionReset).mockReturnValue(vi.fn())
  vi.mocked(getHistoricalPnl).mockResolvedValue(response(yearData()))
  vi.mocked(previewHistoricalPnl).mockResolvedValue(response(preview()))
  vi.mocked(importHistoricalPnl).mockResolvedValue(response({ year: 2026, created_months: [1], unchanged_months: [] }))
})
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()) })

describe('歷史損益參考與現金報表分離', () => {
  it('只顯示已匯入月份、來源、繼承旗標，空白與零有區別', async () => {
    const wrapper = panel()
    await flushPromises()
    expect(wrapper.text()).toContain('歷史損益參考')
    expect(wrapper.text()).toContain('含推估或攤提')
    expect(wrapper.text()).toContain('現金實收實付尚未核對')
    expect(wrapper.findAll('[data-test="historical-month"]')).toHaveLength(1)
    expect(wrapper.get('[data-row-key="expense"]').text()).toContain('推估')
    expect(wrapper.get('[data-row-key="blank"]').text()).toContain('未填')
    expect(wrapper.get('[data-row-key="zero"]').text()).toContain('0')
    expect(wrapper.get('[data-row-key="zero"]').text()).not.toContain('未填')
    expect(wrapper.text()).toContain('測試!B4')
  })

  it('空年度顯示未匯入，不用零假裝全年資料', async () => {
    vi.mocked(getHistoricalPnl).mockResolvedValue(response({ ...yearData(), months: [] }))
    const wrapper = panel()
    await flushPromises()
    expect(wrapper.text()).toContain('2026 年尚未匯入歷史損益參考')
    expect(wrapper.find('[data-test="historical-totals"]').exists()).toBe(false)
  })

  it('載入失敗顯示獨立重試，不回顯錯誤內文', async () => {
    vi.mocked(getHistoricalPnl).mockRejectedValue({ response: { status: 500, data: { detail: '不應回顯的資料' } } })
    const wrapper = panel()
    await flushPromises()
    expect(wrapper.text()).toContain('歷史損益參考載入失敗')
    expect(wrapper.text()).not.toContain('不應回顯')
    vi.mocked(getHistoricalPnl).mockResolvedValue(response(yearData()))
    await wrapper.get('[data-test="historical-retry"]').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-test="historical-month"]')).toHaveLength(1)
  })
})

describe('匯入預覽與確認', () => {
  it.each(['REPORTS', 'FEES_WRITE', 'VENDOR_PAYMENT_WRITE'])('缺少 %s 就隱藏匯入入口', async denied => {
    vi.mocked(hasPermission).mockImplementation(code => code !== denied)
    const wrapper = panel()
    await flushPromises()
    expect(wrapper.find('[data-test="historical-import"]').exists()).toBe(false)
  })

  it('超過 1 MiB 與非 JSON 檔案都不送至預覽 API', async () => {
    const wrapper = panel()
    await flushPromises()
    await choose(wrapper, '{}', 1024 * 1024 + 1)
    expect(wrapper.text()).toContain('檔案不可超過 1 MiB')
    await choose(wrapper, '{不完整')
    expect(wrapper.text()).toContain('請選擇本年度整理後的損益 JSON')
    expect(previewHistoricalPnl).not.toHaveBeenCalled()
  })

  it('伺服器預覽成功後才啟用匯入，連點只送一次，成功重新 GET', async () => {
    const pending = deferred<AxiosResponse<{ year: number; created_months: number[]; unchanged_months: number[] }>>()
    vi.mocked(importHistoricalPnl).mockReturnValue(pending.promise)
    const wrapper = panel()
    await flushPromises()
    await choose(wrapper)
    expect(importHistoricalPnl).not.toHaveBeenCalled()
    await wrapper.get('[data-test="historical-preview-button"]').trigger('click')
    await flushPromises()
    expect(previewHistoricalPnl).toHaveBeenCalledWith(input())
    const confirm = wrapper.get('[data-test="historical-confirm"]')
    await confirm.trigger('click')
    await confirm.trigger('click')
    expect(importHistoricalPnl).toHaveBeenCalledTimes(1)
    pending.resolve(response({ year: 2026, created_months: [1], unchanged_months: [] }))
    await flushPromises()
    expect(wrapper.text()).toContain('新增 1 個月，原有資料不變 0 個月')
    expect(getHistoricalPnl).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-test="historical-confirm"]').exists()).toBe(false)
  })

  it('有衝突就不能匯入，409 後也必須重新預覽', async () => {
    vi.mocked(previewHistoricalPnl).mockResolvedValueOnce(response(preview(true)))
    const wrapper = panel()
    await flushPromises()
    await choose(wrapper)
    await wrapper.get('[data-test="historical-preview-button"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-test="historical-confirm"]').attributes('disabled')).toBeDefined()
    expect(importHistoricalPnl).not.toHaveBeenCalled()
    await wrapper.get('[data-test="historical-preview-button"]').trigger('click')
    await flushPromises()
    vi.mocked(importHistoricalPnl).mockRejectedValue({ response: { status: 409 } })
    await wrapper.get('[data-test="historical-confirm"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('資料已變更或有衝突，請重新預覽')
    expect(wrapper.find('[data-test="historical-confirm"]').exists()).toBe(false)
  })

  it('換檔即丟棄舊預覽，較晚回來的預覽也不得套用', async () => {
    const pending = deferred<AxiosResponse<HistoricalPnlPreview>>()
    vi.mocked(previewHistoricalPnl).mockReturnValue(pending.promise)
    const wrapper = panel()
    await flushPromises()
    await choose(wrapper)
    await wrapper.get('[data-test="historical-preview-button"]').trigger('click')
    await choose(wrapper, '{檔案已替換')
    pending.resolve(response(preview()))
    await flushPromises()
    expect(wrapper.find('[data-test="historical-confirm"]').exists()).toBe(false)
    expect(importHistoricalPnl).not.toHaveBeenCalled()
  })

  it('身分切換清空來源與預覽，晚到預覽不得復原', async () => {
    const pending = deferred<AxiosResponse<HistoricalPnlPreview>>()
    vi.mocked(previewHistoricalPnl).mockReturnValue(pending.promise)
    const wrapper = panel()
    await flushPromises()
    await choose(wrapper)
    await wrapper.get('[data-test="historical-preview-button"]').trigger('click')
    vi.mocked(onAdminSessionReset).mock.calls[0][0]({ source: 'remote' })
    pending.resolve(response(preview()))
    await flushPromises()
    expect(wrapper.find('[data-test="historical-confirm"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="historical-month"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('合成測試.xlsx')
  })

  it('舊檔讀取較晚完成時，不能蓋過新檔的驗證結果', async () => {
    const pending = deferred<string>()
    const wrapper = panel()
    await flushPromises()
    const oldFile = new File([''], '舊檔.json')
    Object.defineProperty(oldFile, 'text', { value: () => pending.promise })
    Object.defineProperty(wrapper.get('[data-test="historical-file"]').element, 'files', { value: [oldFile], configurable: true })
    await wrapper.get('[data-test="historical-file"]').trigger('change')
    await choose(wrapper, '{新檔格式錯誤')
    pending.resolve(JSON.stringify(input()))
    await flushPromises()
    expect(wrapper.text()).toContain('請選擇本年度整理後的損益 JSON')
    expect(wrapper.get('[data-test="historical-preview-button"]').attributes('disabled')).toBeDefined()
  })

  it('換年度清空資料與預覽，不顯示舊年度晚到回應', async () => {
    const oldYear = deferred<AxiosResponse<HistoricalPnlYear>>()
    vi.mocked(getHistoricalPnl).mockReturnValueOnce(oldYear.promise)
    const wrapper = panel()
    await choose(wrapper)
    await wrapper.get('[data-test="historical-preview-button"]').trigger('click')
    await flushPromises()
    vi.mocked(getHistoricalPnl).mockResolvedValue(response({ ...yearData(), year: 2025, months: [] }))
    await wrapper.setProps({ year: 2025 })
    await flushPromises()
    oldYear.resolve(response(yearData()))
    await flushPromises()
    expect(wrapper.text()).toContain('2025 年尚未匯入')
    expect(wrapper.find('[data-test="historical-confirm"]').exists()).toBe(false)
  })
})
