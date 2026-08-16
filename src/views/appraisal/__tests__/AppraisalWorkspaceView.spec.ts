import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import ElementPlus from 'element-plus'
import AppraisalWorkspaceView from '../AppraisalWorkspaceView.vue'

vi.mock('@/api/appraisal', () => ({
  listAppraisalCycles: vi.fn(),
  getAppraisalCurrentCycle: vi.fn(),
  getAppraisalCycleExceptions: vi.fn(),
}))
import { listAppraisalCycles, getAppraisalCurrentCycle, getAppraisalCycleExceptions } from '@/api/appraisal'

const mockedList = vi.mocked(listAppraisalCycles)
const mockedCurrent = vi.mocked(getAppraisalCurrentCycle)
const mockedExceptions = vi.mocked(getAppraisalCycleExceptions)

// CurrentSemesterOverview / CycleDetailPanel 依賴大量其他 API 與 store，
// 本測試只驗證 shell 的組裝與階段切換邏輯，兩個重量級內容元件 stub 掉。
vi.mock('../CurrentSemesterOverview.vue', () => ({ default: { name: 'CurrentSemesterOverview', template: '<div data-test="stub-prepare" />' } }))
vi.mock('../CycleDetailPanel.vue', () => ({
  default: { name: 'CycleDetailPanel', props: ['cycleId'], template: '<div data-test="stub-sign" :data-cycle-id="cycleId" />' },
}))

const CYCLES = [
  { id: 1, academic_year: 114, semester: 'SECOND', status: 'CLOSED' },
  { id: 2, academic_year: 115, semester: 'FIRST', status: 'OPEN' },
]

function router(initialQuery = '') {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/w', component: AppraisalWorkspaceView }, { path: '/', component: { template: '<div/>' } }],
  })
}

async function mountShell(query = '') {
  const r = router()
  await r.push('/w' + query)
  await r.isReady()
  const w = mount(AppraisalWorkspaceView, { global: { plugins: [ElementPlus, r] } })
  await flushPromises()
  return { w, r }
}

describe('AppraisalWorkspaceView', () => {
  beforeEach(() => {
    mockedList.mockReset().mockResolvedValue({ data: CYCLES })
    mockedCurrent.mockReset().mockResolvedValue({ data: CYCLES[1] })
    mockedExceptions.mockReset().mockResolvedValue({
      data: { cycle_id: 2, generated_at: '2026-08-16T10:00:00+08:00', counts_by_type: {}, items: [] },
    })
  })

  it('預設選中目前 OPEN 的週期，預設階段為準備資料，渲染 CurrentSemesterOverview', async () => {
    const { w } = await mountShell()
    expect((w.vm as any).selectedCycleId).toBe(2)
    expect((w.vm as any).stage).toBe('prepare')
    expect(w.find('[data-test="stub-prepare"]').exists()).toBe(true)
  })

  it('切到簽核完成階段渲染 CycleDetailPanel 並帶正確 cycleId', async () => {
    const { w } = await mountShell('?stage=sign')
    expect(w.find('[data-test="stub-sign"]').attributes('data-cycle-id')).toBe('2')
  })

  it('切到審查例外階段渲染 AppraisalCycleExceptionsSummary 並呼叫例外 API', async () => {
    const { w } = await mountShell('?stage=exceptions')
    expect(mockedExceptions).toHaveBeenCalledWith(2)
    expect(w.findComponent({ name: 'AppraisalCycleExceptionsSummary' }).exists()).toBe(true)
  })

  it('審查例外階段切換週期會用新 cycleId 重新呼叫例外 API（:key 強制重掛，非沿用舊資料）', async () => {
    const { w } = await mountShell('?stage=exceptions')
    expect(mockedExceptions).toHaveBeenCalledWith(2)
    mockedExceptions.mockClear()

    await (w.vm as any).selectCycle(1)
    await flushPromises()

    expect(mockedExceptions).toHaveBeenCalledWith(1)
    expect(mockedExceptions).not.toHaveBeenCalledWith(2)
  })

  it('URL 帶 cycle 參數時選中該歷史週期，非目前 OPEN 週期時「準備資料」顯示說明空狀態而非 CurrentSemesterOverview', async () => {
    const { w } = await mountShell('?cycle=1&stage=prepare')
    expect((w.vm as any).selectedCycleId).toBe(1)
    expect(w.find('[data-test="stub-prepare"]').exists()).toBe(false)
    expect(w.findComponent({ name: 'EmptyState' }).exists()).toBe(true)
  })

  it('選中歷史週期時顯示唯讀提示（週期狀態非 OPEN）', async () => {
    const { w } = await mountShell('?cycle=1')
    expect(w.text()).toContain('已完成')
  })

  it('切換週期選擇器會把 cycle 寫回 URL query', async () => {
    const { w, r } = await mountShell()
    await (w.vm as any).selectCycle(1)
    await flushPromises()
    expect(r.currentRoute.value.query.cycle).toBe('1')
  })

  it('切換階段會把 stage 寫回 URL query', async () => {
    const { w, r } = await mountShell()
    await (w.vm as any).selectStage('sign')
    await flushPromises()
    expect(r.currentRoute.value.query.stage).toBe('sign')
  })

  it('無任何週期時顯示空狀態，不呼叫例外/簽核相關渲染', async () => {
    mockedList.mockResolvedValue({ data: [] })
    mockedCurrent.mockResolvedValue({ data: null })
    const { w } = await mountShell()
    expect((w.vm as any).selectedCycleId).toBe(null)
    expect(w.findComponent({ name: 'EmptyState' }).exists()).toBe(true)
  })
})
