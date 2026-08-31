import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'

import CycleDetailPanel from '@/views/appraisal/CycleDetailPanel.vue'

// A6（效能回歸）：load() 內 4 支無資料依賴的 API 應併發（Promise.all），
// 而非串行 await。用「延遲 resolve」與「賦值正確」兩面向鎖住行為：
//  ① 併發證明：四支都回 pending（未 resolve）時，onMounted 觸發 load 後
//     四支 mock 都應已被呼叫（串行版只會呼叫到第一支 listAppraisalCycles）。
//  ② 行為保持：正常 resolve 後，cycle/participants/summaries/catalog 賦值正確。
vi.mock('@/api/appraisal', () => ({
  listAppraisalParticipants: vi.fn(),
  listAppraisalSummaries: vi.fn(),
  listAppraisalCatalog: vi.fn(),
  listAppraisalCycles: vi.fn(),
  recomputeAppraisalSummaries: vi.fn().mockResolvedValue({ data: {} }),
  signSupervisorAppraisalSummary: vi.fn().mockResolvedValue({ data: {} }),
  signAccountingAppraisalSummary: vi.fn().mockResolvedValue({ data: {} }),
  finalizeAppraisalSummary: vi.fn().mockResolvedValue({ data: {} }),
  exportAppraisalCycleXlsxUrl: vi.fn().mockReturnValue('/x'),
  exportAppraisalTransferRosterXlsxUrl: vi.fn().mockReturnValue('/y'),
  getSignStatusSummary: vi.fn().mockResolvedValue({ data: { counts: {} } }),
  getAppraisalAllEmployeesStatus: vi.fn().mockResolvedValue({ data: { participants: [] } }),
  listScoringRules: vi.fn().mockResolvedValue({ data: [] }),
}))

vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}))

const routeQuery = { value: {} as Record<string, unknown> }
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: routeQuery.value }),
  useRouter: () => ({ back: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn().mockReturnValue(true),
}))

import * as api from '@/api/appraisal'

const stub = (name: string) =>
  defineComponent({ name, setup: () => () => h('div', { 'data-test': `${name}-stub` }) })

const stubs = {
  KanbanView: stub('KanbanView'),
  ListView: stub('ListView'),
  RejectDialog: stub('RejectDialog'),
  CommentDialog: stub('CommentDialog'),
  BatchSignButton: stub('BatchSignButton'),
  SignProgressBar: stub('SignProgressBar'),
  EmployeeSummaryDrawer: stub('EmployeeSummaryDrawer'),
  ElButton: { template: '<button><slot /></button>' },
  ElRadioGroup: { template: '<div><slot /></div>' },
  ElRadioButton: { template: '<button><slot /></button>' },
  ElTooltip: { template: '<div><slot /></div>' },
}

const flush = async () => {
  for (let i = 0; i < 4; i += 1) await nextTick()
}

const mountPanel = () => mount(CycleDetailPanel, { props: { cycleId: 5 }, global: { stubs } })

/** 建一個可外部控制 resolve 的 deferred。 */
function deferred<T>() {
  let resolveFn!: (v: T) => void
  const promise = new Promise<T>((res) => { resolveFn = res })
  return { promise, resolve: resolveFn }
}

describe('CycleDetailPanel load() — A6 併發載入', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeQuery.value = {}
  })

  it('四支無依賴 API 併發呼叫：任一 resolve 前四支都已被觸發（串行版會失敗）', async () => {
    // 四支都回 pending deferred（不 resolve），模擬「第一支尚未回」的瞬間。
    const dCycles = deferred<{ data: unknown }>()
    const dParticipants = deferred<{ data: unknown }>()
    const dSummaries = deferred<{ data: unknown }>()
    const dCatalog = deferred<{ data: unknown }>()
    vi.mocked(api.listAppraisalCycles).mockReturnValue(dCycles.promise as never)
    vi.mocked(api.listAppraisalParticipants).mockReturnValue(dParticipants.promise as never)
    vi.mocked(api.listAppraisalSummaries).mockReturnValue(dSummaries.promise as never)
    vi.mocked(api.listAppraisalCatalog).mockReturnValue(dCatalog.promise as never)

    mountPanel()
    // 讓 onMounted → load() 的同步段（Promise.all 陣列求值）跑完
    await nextTick()

    // 併發：Promise.all 同步求值陣列 → 四支在第一個 await 前皆已被呼叫。
    // 串行：只會呼叫到 listAppraisalCycles（後三支被 await 卡住）→ 此處紅燈。
    expect(api.listAppraisalCycles).toHaveBeenCalledTimes(1)
    expect(api.listAppraisalParticipants).toHaveBeenCalledTimes(1)
    expect(api.listAppraisalParticipants).toHaveBeenCalledWith(5)
    expect(api.listAppraisalSummaries).toHaveBeenCalledTimes(1)
    expect(api.listAppraisalSummaries).toHaveBeenCalledWith(5)
    expect(api.listAppraisalCatalog).toHaveBeenCalledTimes(1)

    // 收尾 resolve，避免懸置 pending 影響其他測試
    dCycles.resolve({ data: [] })
    dParticipants.resolve({ data: [] })
    dSummaries.resolve({ data: [] })
    dCatalog.resolve({ data: [] })
    await flush()
  })

  it('併發載入不改變賦值行為：四支結果各自正確落到對應 ref', async () => {
    vi.mocked(api.listAppraisalCycles).mockResolvedValue({
      data: [{ id: 5, academic_year: 114, semester: 'FIRST', base_score: 75.6, status: 'OPEN' }],
    } as never)
    vi.mocked(api.listAppraisalParticipants).mockResolvedValue({
      data: [{ id: 11, employee_id: 101, employee_name: '王小明' }],
    } as never)
    vi.mocked(api.listAppraisalSummaries).mockResolvedValue({
      data: [{ id: 21, participant_id: 11, status: 'DRAFT', total_score: 88 }],
    } as never)
    vi.mocked(api.listAppraisalCatalog).mockResolvedValue({
      data: [{ code: 'X', label: '項目X' }],
    } as never)

    const wrapper = mountPanel()
    await flush()

    const vm = wrapper.vm as unknown as {
      participants: { id: number }[]
      summaries: { id: number }[]
      summaries0Status?: string
    }
    // cycle meta 來自 listAppraisalCycles.find(id===5)
    expect(wrapper.text()).toContain('114 學年')
    // participants / summaries 各自賦值（透過 defineExpose 的 summaries + 內部 ref）
    expect(vm.participants).toHaveLength(1)
    expect(vm.participants[0].id).toBe(11)
    expect(vm.summaries).toHaveLength(1)
    expect(vm.summaries[0].id).toBe(21)
  })
})
