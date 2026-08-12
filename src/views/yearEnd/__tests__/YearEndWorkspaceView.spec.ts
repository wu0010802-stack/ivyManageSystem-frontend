import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { normalizeStep, WORKSPACE_STEPS } from '../workspaceSteps'

describe('workspaceSteps', () => {
  it('三步定義齊全且順序為 config→grid→detail', () => {
    expect(WORKSPACE_STEPS.map((s) => s.key)).toEqual(['config', 'grid', 'detail'])
  })
  it('normalizeStep 對非法值回退 detail', () => {
    expect(normalizeStep('grid')).toBe('grid')
    expect(normalizeStep('xxx')).toBe('detail')
    expect(normalizeStep(undefined)).toBe('detail')
  })
})

// mount-level：預設 step、點導軌切換、右側只掛對應 view、週期頭+狀態機 toolbar、導軌數字（Task 7）
const routeRef = { value: { params: { id: '9' }, query: {} as Record<string, unknown> } }
const replaceMock = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => routeRef.value,
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), back: vi.fn() }),
}))

const mockHasPermission = vi.fn().mockReturnValue(true)
vi.mock('@/utils/auth', () => ({
  hasPermission: (...args: unknown[]) => mockHasPermission(...args),
}))

// Task 7：狀態機（鎖定/封存/退回）搬入 shell — 需要 ElMessageBox.confirm（狀態轉換確認）
// 與 ElMessageBox.alert（封存前置檢核阻擋提示）。
vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn().mockResolvedValue(true), alert: vi.fn() },
  }
})

vi.mock('@/api/yearEnd', () => ({
  getCycleProgress: vi.fn().mockResolvedValue({
    data: { cycle_status: 'OPEN', settings_complete: true, settings_missing_count: 0,
      settlement_count: 5, unmatched_count: 0, sign_counts: { DRAFT: 2, SUPERVISOR_SIGNED: 0, ACCOUNTING_SIGNED: 2, FINALIZED: 1 },
      pending_sign_count: 4, finalized_count: 1, total_count: 5, exception_count: 0 },
  }),
  updateCycleStatus: vi.fn(),
  listYearEndCycles: vi.fn().mockResolvedValue({ data: [{ id: 9, academic_year: 114, status: 'OPEN', bonus_calc_date: '2026-01-15' }] }),
}))

import * as api from '@/api/yearEnd'
import { ElMessage, ElMessageBox } from 'element-plus'

const STUBS = {
  YearEndConfigView: { template: '<div data-test="stub-config" />' },
  YearEndGridView: { template: '<div data-test="stub-grid" />' },
  YearEndDetailView: { template: '<div data-test="stub-detail" />' },
}

async function mountShell() {
  const YearEndWorkspaceView = (await import('../YearEndWorkspaceView.vue')).default
  const wrapper = mount(YearEndWorkspaceView, { global: { stubs: STUBS } })
  // onMounted 觸發的 loadCycle/loadProgress 皆為單層 await 的 promise 鏈，
  // 一個 macrotask tick 足以讓所有待處理 microtask（含 Vue 的 reactivity flush）跑完。
  await new Promise((r) => setTimeout(r))
  return wrapper
}

describe('YearEndWorkspaceView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHasPermission.mockReturnValue(true)
    vi.mocked(api.listYearEndCycles).mockResolvedValue({
      data: [{ id: 9, academic_year: 114, status: 'OPEN', bonus_calc_date: '2026-01-15' }],
    } as never)
    vi.mocked(api.getCycleProgress).mockResolvedValue({
      data: { cycle_status: 'OPEN', settings_complete: true, settings_missing_count: 0,
        settlement_count: 5, unmatched_count: 0, sign_counts: { DRAFT: 2, SUPERVISOR_SIGNED: 0, ACCOUNTING_SIGNED: 2, FINALIZED: 1 },
        pending_sign_count: 4, finalized_count: 1, total_count: 5, exception_count: 0 },
    } as never)
    vi.mocked(ElMessageBox.confirm).mockResolvedValue(true as never)
  })

  it('預設掛 detail 步、導軌顯示三步', async () => {
    routeRef.value = { params: { id: '9' }, query: {} }
    const wrapper = await mountShell()
    expect(wrapper.find('[data-test="stub-detail"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="stub-grid"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-test^="rail-step-"]').length).toBe(3)
  })

  it('點 rail-step-grid → goStep 呼叫 router.replace 帶 step:grid', async () => {
    routeRef.value = { params: { id: '9' }, query: {} }
    const wrapper = await mountShell()
    replaceMock.mockClear()

    await wrapper.find('[data-test="rail-step-grid"]').trigger('click')

    expect(replaceMock).toHaveBeenCalledWith({ query: { step: 'grid' } })
  })

  it('progress 到位後導軌 detail 步顯示 pending_sign_count', async () => {
    routeRef.value = { params: { id: '9' }, query: {} }
    const wrapper = await mountShell()

    expect(wrapper.find('[data-test="rail-count-detail"]').text()).toContain('4')
  })

  it('OPEN 週期 + 具 YEAR_END_FINALIZE 權限 → 頭部顯示狀態機「鎖定」鈕', async () => {
    routeRef.value = { params: { id: '9' }, query: {} }
    mockHasPermission.mockImplementation((p: string) => p === 'YEAR_END_FINALIZE')

    const wrapper = await mountShell()

    expect(wrapper.find('[data-test="lock-cycle-button"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="close-cycle-button"]').exists()).toBe(false)
  })

  it('CLOSED 週期 + 具 YEAR_END_FINALIZE 權限 → 頭部顯示「退回鎖定」鈕', async () => {
    routeRef.value = { params: { id: '9' }, query: {} }
    vi.mocked(api.listYearEndCycles).mockResolvedValue({
      data: [{ id: 9, academic_year: 114, status: 'CLOSED', bonus_calc_date: '2026-01-15' }],
    } as never)

    const wrapper = await mountShell()

    expect(wrapper.find('[data-test="reopen-locked-button"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="lock-cycle-button"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="close-cycle-button"]').exists()).toBe(false)
  })

  it('無 YEAR_END_FINALIZE 權限 → 不顯示任何狀態機按鈕', async () => {
    routeRef.value = { params: { id: '9' }, query: {} }
    mockHasPermission.mockReturnValue(false)

    const wrapper = await mountShell()

    expect(wrapper.find('[data-test="lock-cycle-button"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="close-cycle-button"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="reopen-open-button"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="reopen-locked-button"]').exists()).toBe(false)
  })

  /**
   * Code review Important finding：closeCycle() 原用 `progress.value?.pending_sign_count ?? 0`
   * 判斷是否擋封存——cycle 與 progress 現為各自獨立載入（loadCycle/loadProgress），progress
   * 尚未就緒或載入失敗時 `?? 0` 會被當成「無待簽」而 fail-open 靜默放行封存，把仍有未核定
   * 結算單的週期送去封存（BE 雖有 all-FINALIZED 守衛會擋，但 FE 無警示直接送出，對使用者是
   * 誤導）。舊版 cycle+settlements 原子載入、沒載成功「封存」鈕根本不出現，此保護在重構時弄丟。
   * 修復後 progress 未載入時必須 fail-closed：擋下 + 警示，不進 confirm、不呼叫 updateCycleStatus。
   */
  it('封存前置檢核 fail-closed：progress 尚未載入完成（載入失敗）時擋下封存，不放行', async () => {
    routeRef.value = { params: { id: '9' }, query: {} }
    vi.mocked(api.listYearEndCycles).mockResolvedValue({
      data: [{ id: 9, academic_year: 114, status: 'LOCKED', bonus_calc_date: '2026-01-15' }],
    } as never)
    vi.mocked(api.getCycleProgress).mockRejectedValue(new Error('network error'))

    const wrapper = await mountShell()
    const closeBtn = wrapper.find('[data-test="close-cycle-button"]')
    expect(closeBtn.exists()).toBe(true)

    await closeBtn.trigger('click')
    await new Promise((r) => setTimeout(r))

    expect(ElMessage.warning).toHaveBeenCalledWith('週期進度尚未載入完成，暫時無法確認是否可封存，請稍後再試')
    expect(ElMessageBox.alert).not.toHaveBeenCalled()
    expect(ElMessageBox.confirm).not.toHaveBeenCalled()
    expect(api.updateCycleStatus).not.toHaveBeenCalled()
  })

  it('封存前置檢核：pending_sign_count>0 時點「封存」被阻擋，不呼叫 updateCycleStatus', async () => {
    routeRef.value = { params: { id: '9' }, query: {} }
    vi.mocked(api.listYearEndCycles).mockResolvedValue({
      data: [{ id: 9, academic_year: 114, status: 'LOCKED', bonus_calc_date: '2026-01-15' }],
    } as never)
    // pending_sign_count 沿用 beforeEach 預設值 4（> 0）

    const wrapper = await mountShell()
    const closeBtn = wrapper.find('[data-test="close-cycle-button"]')
    expect(closeBtn.exists()).toBe(true)

    await closeBtn.trigger('click')
    await new Promise((r) => setTimeout(r))

    expect(ElMessageBox.alert).toHaveBeenCalledWith(
      expect.stringContaining('4'),
      '無法封存',
      expect.objectContaining({ type: 'error' }),
    )
    expect(ElMessageBox.confirm).not.toHaveBeenCalled()
    expect(api.updateCycleStatus).not.toHaveBeenCalled()
  })

  // 批次 A①（2026-08-12）：loadCycle/loadProgress 原為空 catch 靜默降級——表頭與導軌
  // 數字消失但使用者毫無感知，會誤信「進度為空＝沒有待辦」。改為顯示可重試的錯誤提示
  //（維持不擋操作的降級語意，但失敗必須可見）。
  it('cycle 載入失敗 → 顯示錯誤提示與重試鈕；重試成功後提示消失、表頭恢復', async () => {
    routeRef.value = { params: { id: '9' }, query: {} }
    vi.mocked(api.listYearEndCycles).mockRejectedValueOnce(new Error('network error'))

    const wrapper = await mountShell()
    expect(wrapper.find('[data-test="header-load-error"]').exists()).toBe(true)

    // beforeEach 預設 mock 已恢復成功（rejectedValueOnce 只發作一次）→ 點重試應復原
    await wrapper.find('[data-test="header-retry-button"]').trigger('click')
    await new Promise((r) => setTimeout(r))

    expect(wrapper.find('[data-test="header-load-error"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('114 學年度')
  })

  it('progress 載入失敗（cycle 正常）→ 仍顯示錯誤提示', async () => {
    routeRef.value = { params: { id: '9' }, query: {} }
    vi.mocked(api.getCycleProgress).mockRejectedValueOnce(new Error('network error'))

    const wrapper = await mountShell()

    expect(wrapper.find('[data-test="header-load-error"]').exists()).toBe(true)
    // cycle 本身載入成功，表頭照常顯示（部分降級，不整塊消失）
    expect(wrapper.text()).toContain('114 學年度')
  })

  it('cycle 與 progress 皆載入成功 → 不顯示載入錯誤提示', async () => {
    routeRef.value = { params: { id: '9' }, query: {} }
    const wrapper = await mountShell()
    expect(wrapper.find('[data-test="header-load-error"]').exists()).toBe(false)
  })

  it('封存前置檢核通過（pending_sign_count=0）：confirm + updateCycleStatus(CLOSED) 後重載 cycle/progress', async () => {
    routeRef.value = { params: { id: '9' }, query: {} }
    vi.mocked(api.listYearEndCycles).mockResolvedValue({
      data: [{ id: 9, academic_year: 114, status: 'LOCKED', bonus_calc_date: '2026-01-15' }],
    } as never)
    vi.mocked(api.getCycleProgress).mockResolvedValue({
      data: { cycle_status: 'LOCKED', settings_complete: true, settings_missing_count: 0,
        settlement_count: 5, unmatched_count: 0, sign_counts: { DRAFT: 0, SUPERVISOR_SIGNED: 0, ACCOUNTING_SIGNED: 0, FINALIZED: 5 },
        pending_sign_count: 0, finalized_count: 5, total_count: 5, exception_count: 0 },
    } as never)
    vi.mocked(api.updateCycleStatus).mockResolvedValue({ data: {} } as never)

    const wrapper = await mountShell()
    const closeBtn = wrapper.find('[data-test="close-cycle-button"]')
    await closeBtn.trigger('click')
    await new Promise((r) => setTimeout(r))

    expect(ElMessageBox.alert).not.toHaveBeenCalled()
    expect(ElMessageBox.confirm).toHaveBeenCalled()
    expect(api.updateCycleStatus).toHaveBeenCalledWith(9, { status: 'CLOSED' })
    // 成功後重載 cycle + progress（表頭狀態 tag 與導軌數字一併更新）
    expect(api.listYearEndCycles).toHaveBeenCalledTimes(2)
    expect(api.getCycleProgress).toHaveBeenCalledTimes(2)
  })
})
