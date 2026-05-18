/**
 * P1-9 / P1-14：CycleDetailView URL query 同步 + 簽核改局部 patch。
 *
 * P1-9：
 *   1. 切 view 觸發 router.replace 帶上 ?view=
 *   2. mount 時 route.query.view 決定初始 view（F5 後恢復）
 *
 * P1-14：
 *   1. sign 成功不觸發 listAppraisalParticipants /
 *      listAppraisalSummaries / listAppraisalCatalog / listAppraisalCycles
 *      四個 reload API
 *   2. summaries 本地 status 立即被 patch（DRAFT → SUPERVISOR_SIGNED）
 *   3. 同筆重複 click 時第二次 promise 立刻 resolve（防護）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const {
  apiMocks,
  routerMock,
  initialRouteQuery,
  elMessage,
} = vi.hoisted(() => {
  const apiMocks = {
    listAppraisalCycles: vi.fn(() =>
      Promise.resolve({
        data: [{
          id: 1, academic_year: 114, semester: 'FIRST',
          base_score_calc_date: '2026-05-01', base_score: '80', status: 'OPEN',
        }],
      }),
    ),
    listAppraisalParticipants: vi.fn(() => Promise.resolve({ data: [] })),
    listAppraisalSummaries: vi.fn(() =>
      Promise.resolve({
        data: [
          { id: 100, participant_id: 10, status: 'DRAFT', employee_name: '張三',
            total_score: '85', grade: 'GOOD', bonus_amount: '0' },
          { id: 101, participant_id: 11, status: 'SUPERVISOR_SIGNED', employee_name: '李四',
            total_score: '80', grade: 'PASS', bonus_amount: '0' },
        ],
      }),
    ),
    listAppraisalCatalog: vi.fn(() => Promise.resolve({ data: [] })),
    recomputeAppraisalSummaries: vi.fn(),
    signSupervisorAppraisalSummary: vi.fn(() => Promise.resolve({ data: {} })),
    signAccountingAppraisalSummary: vi.fn(() => Promise.resolve({ data: {} })),
    finalizeAppraisalSummary: vi.fn(() => Promise.resolve({ data: {} })),
    exportAppraisalCycleXlsxUrl: () => '#',
    exportAppraisalTransferRosterXlsxUrl: () => '#',
  }
  return {
    apiMocks,
    routerMock: { back: vi.fn(), push: vi.fn(), replace: vi.fn() },
    initialRouteQuery: { value: {} },
    elMessage: { warning: vi.fn(), success: vi.fn(), error: vi.fn() },
  }
})

vi.mock('element-plus', () => ({ ElMessage: elMessage }))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '1' }, query: initialRouteQuery.value }),
  useRouter: () => routerMock,
}))

vi.mock('@/api/appraisal', () => apiMocks)

vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn(() => true),
}))

vi.mock('@/utils/error', () => ({
  apiError: (e, f) => f || 'err',
}))

import CycleDetailView from '@/views/appraisal/CycleDetailView.vue'

const transparentStub = (slotsToRender = ['default']) => ({
  template: `<div>${slotsToRender.map((s) => `<slot name="${s}" />`).join('')}</div>`,
})

const stubs = {
  KanbanView: true,
  ListView: true,
  BatchSignButton: true,
  RejectDialog: true,
  CommentDialog: true,
  SummaryLogDrawer: true,
  'el-button': transparentStub(),
  'el-page-header': transparentStub(),
  'el-radio-group': transparentStub(),
  'el-radio-button': transparentStub(),
  'el-icon': transparentStub(),
}

async function mountView() {
  const w = mount(CycleDetailView, { global: { stubs } })
  await new Promise((r) => setTimeout(r, 0))
  await w.vm.$nextTick()
  return w
}

function clearApiCalls() {
  Object.values(apiMocks).forEach((m) => m.mockClear?.())
}

describe('P1-9 / P1-14 CycleDetailView URL query + local patch', () => {
  beforeEach(() => {
    Object.values(apiMocks).forEach((m) => m.mockClear?.())
    routerMock.replace.mockClear()
    elMessage.success.mockClear()
    elMessage.error.mockClear()
    initialRouteQuery.value = {}
  })

  describe('P1-9 view URL query 同步', () => {
    it('mount 時 route.query.view="list" → 初始 view 為 list', async () => {
      initialRouteQuery.value = { view: 'list' }
      const w = await mountView()
      expect(w.vm.view).toBe('list')
    })

    it('mount 時 route.query.view 缺值 → 初始 view 為 kanban', async () => {
      initialRouteQuery.value = {}
      const w = await mountView()
      expect(w.vm.view).toBe('kanban')
    })

    it('切 view 觸發 router.replace 帶 ?view=list', async () => {
      const w = await mountView()
      w.vm.view = 'list'
      await w.vm.$nextTick()
      expect(routerMock.replace).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.objectContaining({ view: 'list' }) }),
      )
    })

    it('切 view 會清空 selectedIds', async () => {
      const w = await mountView()
      w.vm.selectedIds = [10, 11]
      await w.vm.$nextTick()
      w.vm.view = 'list'
      await w.vm.$nextTick()
      expect(w.vm.selectedIds).toEqual([])
    })
  })

  describe('P1-14 sign 局部 patch 取代全 reload', () => {
    it('sign 成功時不再呼叫 listAppraisalParticipants / Summaries / Catalog / Cycles', async () => {
      const w = await mountView()
      // 清掉初次載入的 call count
      clearApiCalls()
      await w.vm.sign({ summary: { id: 100 }, stage: 'supervisor' })
      await w.vm.$nextTick()
      expect(apiMocks.signSupervisorAppraisalSummary).toHaveBeenCalledWith(100)
      expect(apiMocks.listAppraisalParticipants).not.toHaveBeenCalled()
      expect(apiMocks.listAppraisalSummaries).not.toHaveBeenCalled()
      expect(apiMocks.listAppraisalCatalog).not.toHaveBeenCalled()
      expect(apiMocks.listAppraisalCycles).not.toHaveBeenCalled()
    })

    it('sign 成功後 summaries 本地 status 立即被 patch', async () => {
      const w = await mountView()
      const before = w.vm.summaries.find((s) => s.id === 100)
      expect(before.status).toBe('DRAFT')
      await w.vm.sign({ summary: { id: 100 }, stage: 'supervisor' })
      await w.vm.$nextTick()
      const after = w.vm.summaries.find((s) => s.id === 100)
      expect(after.status).toBe('SUPERVISOR_SIGNED')
    })

    it('簽核中時 signingIds 包含該 id；完成後移除', async () => {
      const w = await mountView()
      let resolveFn
      apiMocks.signSupervisorAppraisalSummary.mockImplementation(
        () => new Promise((r) => (resolveFn = r)),
      )
      const p = w.vm.sign({ summary: { id: 100 }, stage: 'supervisor' })
      await w.vm.$nextTick()
      expect(w.vm.isSigning(100)).toBe(true)
      resolveFn({ data: {} })
      await p
      await w.vm.$nextTick()
      expect(w.vm.isSigning(100)).toBe(false)
    })
  })
})
