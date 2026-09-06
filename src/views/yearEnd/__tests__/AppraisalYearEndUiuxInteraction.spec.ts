import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElTable } from 'element-plus'
import YearEndDetailView from '../YearEndDetailView.vue'
import CycleDetailPanel from '@/views/appraisal/CycleDetailPanel.vue'
import BatchSignButton from '@/views/appraisal/components/BatchSignButton.vue'

vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('@/api/yearEnd', async importOriginal => ({
  ...await importOriginal<typeof import('@/api/yearEnd')>(),
  listYearEndCycles: vi.fn().mockResolvedValue({ data: [{ id: 1, status: 'OPEN' }] }),
  listYearEndSettlements: vi.fn().mockResolvedValue({ data: [
    { id: 1, employee_id: 1, employee_name: '測試甲', status: 'DRAFT', total_amount: 100 },
    { id: 2, employee_id: 2, employee_name: '測試乙', status: 'DRAFT', total_amount: 200 },
  ] }),
  listSpecialBonuses: vi.fn().mockResolvedValue({ data: [] }),
  listClassEnrollmentTargets: vi.fn().mockResolvedValue({ data: [] }),
}))
vi.mock('@/api/appraisal', async importOriginal => ({
  ...await importOriginal<typeof import('@/api/appraisal')>(),
  listAppraisalCycles: vi.fn().mockResolvedValue({ data: [{ id: 1, status: 'OPEN' }] }),
  listAppraisalParticipants: vi.fn().mockResolvedValue({ data: [{ id: 1, employee_id: 1, employee_name: '測試甲' }] }),
  listAppraisalSummaries: vi.fn().mockResolvedValue({ data: [{ id: 11, participant_id: 1, status: 'DRAFT' }] }),
  listAppraisalCatalog: vi.fn().mockResolvedValue({ data: [] }),
  getAppraisalAllEmployeesStatus: vi.fn().mockResolvedValue({ data: { participants: [] } }),
  listScoringRules: vi.fn().mockResolvedValue({ data: [] }),
  getSignStatusSummary: vi.fn().mockResolvedValue({ data: {
    counts: { SUPERVISOR_SIGNED: 1 },
    buckets: [{ status: 'SUPERVISOR_SIGNED', summaries: [{ id: 11, employee_id: 1, employee_name: '測試甲', total_score: 80, grade: 'GOOD', bonus_amount: 100 }] }],
  } }),
}))

describe('年終與考核真實控制項狀態一致性', () => {
  beforeEach(() => vi.clearAllMocks())

  it('年終勾選後切換完整對帳，表格勾選與批次名單同時清空', async () => {
    const wrapper = mount(YearEndDetailView, { props: { cycleId: 1 }, global: {
      plugins: [ElementPlus], stubs: { ProvenanceDrawer: true },
    } })
    await flushPromises()
    let table = wrapper.findComponent(ElTable)
    await table.findAll('tbody input[type="checkbox"]')[0].setValue(true)
    expect(wrapper.find('.batch-bar').text()).toContain('已選 1 筆')
    await wrapper.get('.el-switch__core').trigger('click')
    await flushPromises()
    table = wrapper.findComponent(ElTable)
    expect((table.findAll('tbody input[type="checkbox"]')[0].element as HTMLInputElement).checked).toBe(false)
    await table.findAll('tbody input[type="checkbox"]')[1].setValue(true)
    expect(wrapper.find('.batch-bar').text()).toContain('已選 1 筆')
    expect((wrapper.vm as unknown as { selectedSettlements: { id: number }[] }).selectedSettlements.map(row => row.id)).toEqual([2])
    wrapper.unmount()
  })

  it('切入看板取得較新簽核狀態後，勾選卡片採用看板狀態決定批次階段', async () => {
    const wrapper = mount(CycleDetailPanel, { props: { cycleId: 1 }, global: {
      plugins: [ElementPlus], stubs: { ListView: true, RejectDialog: true, CommentDialog: true, EmployeeSummaryDrawer: true },
    } })
    await flushPromises()
    const radios = wrapper.findAll('[data-test="view-toggle"] input[type="radio"]')
    await radios[0].setValue(true)
    await flushPromises()
    await wrapper.get('[data-test="card-checkbox-11"] input[type="checkbox"]').setValue(true)
    await flushPromises()
    const accounting = wrapper.findAllComponents(BatchSignButton).find(button => button.props('stage') === 'ACCOUNTING')!
    expect(accounting.props('selectedIds')).toEqual([11])
    expect(accounting.props('disabled')).toBe(false)
    await wrapper.findAll('[data-test="view-toggle"] input[type="radio"]')[1].setValue(true)
    await flushPromises()
    expect((wrapper.vm as unknown as { summaries: { id: number; status: string }[] }).summaries.find(row => row.id === 11)?.status).toBe('SUPERVISOR_SIGNED')
    wrapper.unmount()
  })
})
