import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import AppraisalPayoutView from '../AppraisalPayoutView.vue'

vi.mock('@/api/yearEnd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/yearEnd')>()
  return {
    ...actual,
    previewAppraisalPayout: vi.fn(),
    generateAppraisalPayout: vi.fn(),
    listAppraisalPayouts: vi.fn(),
    voidAppraisalPayouts: vi.fn(),
  }
})

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn().mockResolvedValue('confirm') },
  }
})

import * as api from '@/api/yearEnd'

const mockPreviewRow = (overrides: Record<string, unknown> = {}) => ({
  employee_id: 1, employee_name: '王主任', role_group: 'DIRECTOR',
  earlier_summary_id: 10, earlier_amount: '6400', earlier_cycle_finalized: true,
  later_summary_id: 20, later_amount: '7200', later_cycle_finalized: true,
  total_amount: '13600', is_inactive: false, warnings: [],
  ...overrides,
})

async function mountView() {
  const wrapper = mount(AppraisalPayoutView, {
    global: {
      stubs: {
        'el-input-number': true, 'el-button': true, 'el-alert': true,
        'el-tabs': true, 'el-tab-pane': true, 'el-table': true,
        'el-table-column': true, 'el-tag': true, 'el-checkbox': true,
      },
    },
  })
  await nextTick()
  await nextTick()
  return wrapper
}

describe('AppraisalPayoutView', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads preview rows on mount', async () => {
    vi.mocked(api.previewAppraisalPayout).mockResolvedValue({
      data: [mockPreviewRow(), mockPreviewRow({ employee_id: 2, employee_name: '林老師' })],
    } as never)
    await mountView()
    expect(api.previewAppraisalPayout).toHaveBeenCalled()
  })

  it('exposes inactive opt-in default off', async () => {
    vi.mocked(api.previewAppraisalPayout).mockResolvedValue({
      data: [
        mockPreviewRow({ employee_id: 1 }),
        mockPreviewRow({ employee_id: 3, employee_name: '陳老師', is_inactive: true }),
      ],
    } as never)
    const wrapper = await mountView()
    // ACTIVE 預設勾、INACTIVE 預設不勾
    const vm = wrapper.vm as unknown as { selected: Set<number> }
    expect(vm.selected.has(1)).toBe(true)
    expect(vm.selected.has(3)).toBe(false)
  })

  it('calls generate with included_inactive ids when user opts in', async () => {
    vi.mocked(api.previewAppraisalPayout).mockResolvedValue({
      data: [
        mockPreviewRow({ employee_id: 1 }),
        mockPreviewRow({ employee_id: 3, is_inactive: true }),
      ],
    } as never)
    vi.mocked(api.generateAppraisalPayout).mockResolvedValue({
      data: { cycle_id: 1, generated_count: 4, affected_employee_count: 2, total_amount: '27200', skipped_inactive_count: 0, warnings: [] },
    } as never)
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { selected: Set<number>; onGenerate: () => Promise<void> }
    vm.selected.add(3)  // user opts in
    await vm.onGenerate()
    expect(api.generateAppraisalPayout).toHaveBeenCalledWith({
      year: expect.any(Number),
      included_inactive_employee_ids: [3],
    })
  })

  it('exposes warning state when any cycle not finalized', async () => {
    vi.mocked(api.previewAppraisalPayout).mockResolvedValue({
      data: [mockPreviewRow({ earlier_cycle_finalized: false })],
    } as never)
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { anyCycleNotFinalized: boolean }
    expect(vm.anyCycleNotFinalized).toBe(true)
  })
})
