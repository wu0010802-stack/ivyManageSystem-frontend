import { describe, it, expect, vi } from 'vitest'
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

// mount-level：預設 step、點導軌切換、右側只掛對應 view
const routeRef = { value: { params: { id: '9' }, query: {} as Record<string, unknown> } }
const replaceMock = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => routeRef.value,
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), back: vi.fn() }),
}))
vi.mock('@/api/yearEnd', () => ({
  getCycleProgress: vi.fn().mockResolvedValue({
    data: { cycle_status: 'OPEN', settings_complete: true, settings_missing_count: 0,
      settlement_count: 5, unmatched_count: 0, sign_counts: { DRAFT: 2, SUPERVISOR_SIGNED: 0, ACCOUNTING_SIGNED: 2, FINALIZED: 1 },
      pending_sign_count: 4, finalized_count: 1, total_count: 5, exception_count: 0 },
  }),
  updateCycleStatus: vi.fn(),
  listYearEndCycles: vi.fn().mockResolvedValue({ data: [{ id: 9, academic_year: 114, status: 'OPEN', bonus_calc_date: '2026-01-15' }] }),
}))

describe('YearEndWorkspaceView', () => {
  it('預設掛 detail 步、導軌顯示三步', async () => {
    routeRef.value = { params: { id: '9' }, query: {} }
    const YearEndWorkspaceView = (await import('../YearEndWorkspaceView.vue')).default
    const wrapper = mount(YearEndWorkspaceView, {
      global: { stubs: {
        YearEndConfigView: { template: '<div data-test="stub-config" />' },
        YearEndGridView: { template: '<div data-test="stub-grid" />' },
        YearEndDetailView: { template: '<div data-test="stub-detail" />' },
      } },
    })
    await new Promise((r) => setTimeout(r))
    expect(wrapper.find('[data-test="stub-detail"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="stub-grid"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-test^="rail-step-"]').length).toBe(3)
  })
})
