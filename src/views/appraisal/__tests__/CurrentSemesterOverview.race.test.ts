import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// C3e（正確性）：watch(term-key) → reloadAll 串行 await
// fetchCurrentCycle→refreshIfOpen→loadStatus→loadRules，各子步驟原本讀共享
// currentCycle.value。快速切學期 A(慢)→B(快) 交錯時，晚到的 A 會把 currentCycle
// 與狀態表覆寫回 A，導致資料與標頭學期不一致。
// 修法：reloadAll 導入 epoch 序號，各 await 後 if(stale) return，並把該次載入的
// currentCycle 以區域變數傳給 refreshIfOpen/loadStatus/loadRules。
// 本測試鎖住：A(慢)→B(快) 後，最終 currentCycle 與彙整狀態表皆為 B。

vi.mock('@/api/appraisal', () => ({
  getAppraisalCurrentCycle: vi.fn(),
  getAppraisalAllEmployeesStatus: vi.fn(),
  syncAppraisalScoreItems: vi.fn(),
  createAppraisalCycle: vi.fn(),
  addAppraisalParticipant: vi.fn(),
  bulkAddAppraisalParticipantsFromActive: vi.fn(),
  listScoringRules: vi.fn(),
  refreshAppraisalCycle: vi.fn(),
  // Task A3：流程引導條讀取簽核統計；本檔聚焦切學期競態，用無害預設值消化
  getSignStatusSummary: vi.fn(),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

vi.mock('@element-plus/icons-vue', () => ({
  Refresh: {},
  Connection: {},
  Plus: {},
  DataAnalysis: {},
}))

vi.mock('@/composables/useErrorNotify', () => ({
  useErrorNotify: () => ({ notify: vi.fn() }),
}))

import {
  getAppraisalCurrentCycle,
  getAppraisalAllEmployeesStatus,
  listScoringRules,
  refreshAppraisalCycle,
  getSignStatusSummary,
} from '@/api/appraisal'
import CurrentSemesterOverview from '../CurrentSemesterOverview.vue'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

const stubs = {
  AcademicTermSelector: true,
  StatCard: true,
  AggregatedStatusDetailDialog: true,
  ManualEventEntrySection: true,
  ScorePreviewDialog: true,
  AdminListToolbar: true,
  'el-button': true,
  'el-alert': true,
  'el-skeleton': true,
  'el-collapse': true,
  'el-collapse-item': true,
  'el-table': true,
  'el-table-column': true,
  'el-tag': true,
  'el-dialog': true,
  'el-tooltip': true,
}

async function mountView() {
  // 初始 immediate watch → reloadAll（epoch 1）：以無害預設 mock 消化。
  vi.mocked(getAppraisalCurrentCycle).mockResolvedValue({
    data: { id: 1, status: 'CLOSED', base_score_calc_date: '2026-01-01' },
  } as never)
  vi.mocked(getAppraisalAllEmployeesStatus).mockResolvedValue({
    data: { participants: [], generated_at: null },
  } as never)
  vi.mocked(listScoringRules).mockResolvedValue({ data: [] } as never)
  vi.mocked(refreshAppraisalCycle).mockResolvedValue({ data: {} } as never)
  vi.mocked(getSignStatusSummary).mockResolvedValue({ data: { counts: {} } } as never)

  const wrapper = mount(CurrentSemesterOverview, {
    global: {
      plugins: [createPinia()],
      stubs,
      directives: { loading: () => {} },
    },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
})

describe('CurrentSemesterOverview 切學期競態（C3e）', () => {
  it('切學期 A(慢)→B(快)：晚到的 A 不得覆寫 currentCycle 與狀態表（最終皆為 B）', async () => {
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      reloadAll: () => Promise<void>
      currentCycle: { id: number } | null
      aggregatedStatus: { participants?: Array<{ employee_id: number }> } | null
    }

    // A(慢)：fetchCurrentCycle 延遲；B(快)：立即回應。
    const slowCycleA = deferred<{ data: unknown }>()
    vi.mocked(getAppraisalCurrentCycle)
      .mockReturnValueOnce(slowCycleA.promise as never)
      .mockResolvedValueOnce({
        data: { id: 22, status: 'CLOSED', base_score_calc_date: '2026-02-01' },
      } as never)

    // 狀態表：B 先被呼叫（快）→ 200；A 若（buggy）稍後被呼叫 → 100。
    vi.mocked(getAppraisalAllEmployeesStatus)
      .mockResolvedValueOnce({
        data: { participants: [{ employee_id: 200, employee_name: 'B教師' }], generated_at: '2026-07-17T10:00:00Z' },
      } as never)
      .mockResolvedValueOnce({
        data: { participants: [{ employee_id: 100, employee_name: 'A教師' }], generated_at: '2026-07-17T09:00:00Z' },
      } as never)
    vi.mocked(listScoringRules).mockResolvedValue({ data: [] } as never)

    // A 先觸發（慢，pending），B 隨即觸發（快，完成）。
    const runA = vm.reloadAll()
    await vm.reloadAll()
    await flushPromises()

    // B 已落地
    expect(vm.currentCycle?.id).toBe(22)
    expect(vm.aggregatedStatus?.participants?.[0]?.employee_id).toBe(200)

    // A 的慢回應此刻才到 → 不得覆寫 B
    slowCycleA.resolve({ data: { id: 11, status: 'CLOSED', base_score_calc_date: '2026-01-01' } })
    await runA
    await flushPromises()

    expect(vm.currentCycle?.id).toBe(22)
    expect(vm.aggregatedStatus?.participants?.[0]?.employee_id).toBe(200)
  })
})
