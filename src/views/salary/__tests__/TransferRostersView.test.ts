import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// /salary/rosters（轉帳名冊集中頁，2026-10-29 W1）：只負責選期別→呼叫既有 downloadTransferRoster，
// 各區塊 gate 對齊後端：月薪／表外＝SALARY_READ＋全員薪資視野；年終＝YEAR_END_READ＋全員視野；考核＝APPRAISAL_ACCOUNTING。
const { permState } = vi.hoisted(() => ({
  permState: { perms: new Set<string>(), fullView: true },
}))
vi.mock('@/utils/auth', () => ({
  hasPermission: (name: string) => permState.perms.has(name),
  hasFullSalaryView: () => permState.fullView,
}))

const pushMock = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push: pushMock }) }))

const downloadMock = vi.fn()
vi.mock('@/utils/transferRoster', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/transferRoster')>()),
  downloadTransferRoster: (...a: unknown[]) => downloadMock(...a),
}))

const categoriesMock = vi.fn()
vi.mock('@/api/extraBonuses', () => ({ listExtraBonusCategories: () => categoriesMock() }))
const yearEndCyclesMock = vi.fn()
vi.mock('@/api/yearEnd', () => ({ listYearEndCycles: () => yearEndCyclesMock() }))
const appraisalCyclesMock = vi.fn()
vi.mock('@/api/appraisal', () => ({ listAppraisalCycles: () => appraisalCyclesMock() }))

const messageErrorMock = vi.fn()
vi.mock('element-plus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('element-plus')>()),
  ElMessage: { error: (...a: unknown[]) => messageErrorMock(...a), warning: vi.fn(), success: vi.fn() },
}))

import TransferRostersView from '../TransferRostersView.vue'

const STUBS = {
  PageHeader: { template: '<div><slot name="actions" /></div>' },
  YearMonthPicker: true,
  'el-card': { template: '<div><slot /></div>' },
  'el-button': {
    props: ['disabled', 'loading'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  },
  'el-select': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>',
  },
  'el-option': { props: ['label', 'value'], template: '<option :value="value">{{ label }}</option>' },
  'el-empty': { props: ['description'], template: '<div class="empty">{{ description }}</div>' },
}

const mountView = () => mount(TransferRostersView, { global: { stubs: STUBS } })

const yearEndCycle = (over: Record<string, unknown> = {}) => ({
  id: 1, academic_year: 114, status: 'CLOSED', bonus_calc_date: '2026-01-31', ...over,
})
const appraisalCycle = (over: Record<string, unknown> = {}) => ({
  id: 10, academic_year: 114, semester: 'FIRST', status: 'CLOSED', ...over,
})

describe('TransferRostersView', () => {
  beforeEach(() => {
    permState.perms = new Set(['SALARY_READ', 'YEAR_END_READ', 'APPRAISAL_ACCOUNTING'])
    permState.fullView = true
    pushMock.mockReset()
    downloadMock.mockReset().mockResolvedValue(true)
    categoriesMock.mockReset().mockResolvedValue({
      data: [
        { value: 'growth_contract', label: '自主成長契約獎勵金' },
        { value: 'recruitment', label: '招生獎金' },
        { value: 'returning_prepay', label: '舊生預繳獎金' },
      ],
    })
    yearEndCyclesMock.mockReset().mockResolvedValue({
      data: [yearEndCycle({ id: 1, academic_year: 113 }), yearEndCycle({ id: 2, academic_year: 114 })],
    })
    appraisalCyclesMock.mockReset().mockResolvedValue({
      data: [
        appraisalCycle({ id: 10, semester: 'FIRST' }),
        appraisalCycle({ id: 11, semester: 'SECOND' }),
        appraisalCycle({ id: 9, academic_year: 113, semester: 'SECOND' }),
      ],
    })
    messageErrorMock.mockReset()
  })

  it('全權限：五個區塊都在', async () => {
    const w = mountView()
    await flushPromises()
    for (const s of ['monthly', 'extra', 'year-end', 'appraisal', 'recruitment']) {
      expect(w.find(`[data-test="section-${s}"]`).exists(), s).toBe(true)
    }
    expect(w.find('.empty').exists()).toBe(false)
  })

  it('月薪名冊：五種 type 各自帶年月與 type 參數呼叫既有下載函式', async () => {
    const w = mountView()
    await flushPromises()
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth() + 1
    const mm = String(m).padStart(2, '0')

    await w.get('[data-test="monthly-base"]').trigger('click')
    await flushPromises()
    expect(downloadMock).toHaveBeenLastCalledWith(
      `/salaries/${y}/${m}/transfer-roster`,
      `${y}年${mm}月_薪資本薪轉帳名冊.xlsx`,
      { type: 'base' },
    )

    await w.get('[data-test="monthly-cash"]').trigger('click')
    await flushPromises()
    // 領現名冊不是銀行轉帳檔，檔名不叫「轉帳名冊」
    expect(downloadMock).toHaveBeenLastCalledWith(
      `/salaries/${y}/${m}/transfer-roster`,
      `${y}年${mm}月_領現名冊.xlsx`,
      { type: 'cash' },
    )
    for (const t of ['festival', 'surplus', 'art_teacher']) {
      expect(w.find(`[data-test="monthly-${t}"]`).exists(), t).toBe(true)
    }
  })

  it('表外獎金名冊：預設全部類別只帶 period；選類別後多帶 category；下拉排除招生獎金', async () => {
    const w = mountView()
    await flushPromises()
    const now = new Date()
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const options = w.findAll('[data-test="extra-category"] option').map((o) => o.attributes('value'))
    expect(options).toEqual(['', 'growth_contract', 'returning_prepay'])

    await w.get('[data-test="extra-download"]').trigger('click')
    await flushPromises()
    expect(downloadMock).toHaveBeenLastCalledWith('/extra-bonuses/transfer-roster', expect.any(String), { period })

    await w.get('[data-test="extra-category"]').setValue('growth_contract')
    await w.get('[data-test="extra-download"]').trigger('click')
    await flushPromises()
    expect(downloadMock).toHaveBeenLastCalledWith(
      '/extra-bonuses/transfer-roster',
      expect.stringContaining('自主成長契約獎勵金'),
      { period, category: 'growth_contract' },
    )
  })

  it('類別清單載入失敗：不吞錯，顯示錯誤並仍可下載全部類別', async () => {
    categoriesMock.mockRejectedValue(new Error('boom'))
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-test="extra-categories-error"]').exists()).toBe(true)
    expect(messageErrorMock).toHaveBeenCalled()
    await w.get('[data-test="extra-download"]').trigger('click')
    await flushPromises()
    expect(downloadMock).toHaveBeenCalledTimes(1)
  })

  it('年終名冊：預設最新學年，xlsx 與 pdf 走各自既有路徑', async () => {
    const w = mountView()
    await flushPromises()
    await w.get('[data-test="year-end-xlsx"]').trigger('click')
    await flushPromises()
    expect(downloadMock).toHaveBeenLastCalledWith('/year_end/cycles/2/transfer_roster.xlsx', '年終轉帳名冊.xlsx')

    await w.get('[data-test="year-end-cycle"]').setValue('1')
    await w.get('[data-test="year-end-pdf"]').trigger('click')
    await flushPromises()
    expect(downloadMock).toHaveBeenLastCalledWith('/year_end/cycles/1/transfer_roster.pdf', '年終轉帳名冊.pdf')
  })

  it('考核名冊：預設最新學年下學期', async () => {
    const w = mountView()
    await flushPromises()
    await w.get('[data-test="appraisal-download"]').trigger('click')
    await flushPromises()
    expect(downloadMock).toHaveBeenLastCalledWith('/appraisal/cycles/11/transfer_roster.xlsx', '考核獎金轉帳名冊.xlsx')
  })

  it('週期載入失敗：顯示錯誤與重試，且不給下載鈕（不當成空清單）', async () => {
    yearEndCyclesMock.mockRejectedValue(new Error('boom'))
    appraisalCyclesMock.mockRejectedValue(new Error('boom'))
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-test="year-end-error"]').exists()).toBe(true)
    expect(w.find('[data-test="appraisal-error"]').exists()).toBe(true)
    expect(w.find('[data-test="year-end-empty"]').exists()).toBe(false)
    expect(w.find('[data-test="year-end-xlsx"]').exists()).toBe(false)
    expect(w.find('[data-test="appraisal-download"]').exists()).toBe(false)
  })

  it('一個下載進行中，其他下載鈕鎖住（防重複匯出）', async () => {
    let release: (v: boolean) => void = () => {}
    downloadMock.mockReturnValueOnce(new Promise<boolean>((r) => { release = r }))
    const w = mountView()
    await flushPromises()
    await w.get('[data-test="monthly-base"]').trigger('click')
    await flushPromises()
    expect(w.get('[data-test="monthly-festival"]').attributes('disabled')).toBeDefined()
    expect(w.get('[data-test="extra-download"]').attributes('disabled')).toBeDefined()
    release(true)
    await flushPromises()
    expect(w.get('[data-test="monthly-festival"]').attributes('disabled')).toBeUndefined()
  })

  it('非全員薪資視野：月薪／表外／招生區塊與其 API 都不出現', async () => {
    permState.fullView = false
    permState.perms = new Set(['SALARY_READ', 'APPRAISAL_ACCOUNTING'])
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-test="section-monthly"]').exists()).toBe(false)
    expect(w.find('[data-test="section-extra"]').exists()).toBe(false)
    expect(w.find('[data-test="section-recruitment"]').exists()).toBe(false)
    expect(categoriesMock).not.toHaveBeenCalled()
    // 年終要全員視野；考核只看 APPRAISAL_ACCOUNTING
    expect(w.find('[data-test="section-year-end"]').exists()).toBe(false)
    expect(yearEndCyclesMock).not.toHaveBeenCalled()
    expect(w.find('[data-test="section-appraisal"]').exists()).toBe(true)
  })

  it('沒有 YEAR_END_READ／APPRAISAL_ACCOUNTING：對應區塊與週期 API 都不碰', async () => {
    permState.perms = new Set(['SALARY_READ'])
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-test="section-year-end"]').exists()).toBe(false)
    expect(w.find('[data-test="section-appraisal"]').exists()).toBe(false)
    expect(yearEndCyclesMock).not.toHaveBeenCalled()
    expect(appraisalCyclesMock).not.toHaveBeenCalled()
    expect(w.find('[data-test="section-monthly"]').exists()).toBe(true)
  })

  it('什麼都不能下載：顯示空狀態', async () => {
    permState.perms = new Set()
    const w = mountView()
    await flushPromises()
    expect(w.find('.empty').exists()).toBe(true)
  })

  it('招生獎金區塊只放連結（該名冊無下載函式），導向招生獎金頁', async () => {
    const w = mountView()
    await flushPromises()
    await w.get('[data-test="recruitment-link"]').trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/salary/recruitment-bonus')
    expect(downloadMock).not.toHaveBeenCalled()
  })
})
