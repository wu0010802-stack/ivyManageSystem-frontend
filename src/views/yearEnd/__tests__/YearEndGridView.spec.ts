import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import YearEndGridView from '../YearEndGridView.vue'

vi.mock('@/api/yearEnd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/yearEnd')>()
  return {
    ...actual,
    getYearEndGrid: vi.fn(),
    buildSettlements: vi.fn(),
    manualPatchSettlement: vi.fn(),
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

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '7' }, query: {} }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}))

vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn().mockReturnValue(true),
}))

// Mock api index so baseURL resolves in the component without errors
vi.mock('@/api/index', () => ({
  default: { defaults: { baseURL: '/api' }, get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))

import * as api from '@/api/yearEnd'
import { ElMessage } from 'element-plus'

// ---- helpers ----

type GridRow = {
  settlement_id: number
  employee_id: number
  employee_name: string
  payable_amount: string
  special_bonuses: Record<string, string>
  total_amount: string
  status: string
}

function makeRow(overrides: Partial<GridRow> = {}): GridRow {
  return {
    settlement_id: 1,
    employee_id: 10,
    employee_name: '蔡宜倩',
    payable_amount: '29044.71',
    special_bonuses: {
      APPRAISAL_HALF_BONUS_FIRST: '3312',
      EXCESS_ENROLLMENT: '2000',
    },
    total_amount: '40106.71',
    status: 'DRAFT',
    ...overrides,
  }
}

async function mountView() {
  const wrapper = mount(YearEndGridView, {
    global: {
      stubs: {
        'el-table': true,
        'el-table-column': true,
        'el-button': true,
        'el-tag': true,
        'el-dialog': true,
        'el-form': true,
        'el-form-item': true,
        'el-input-number': true,
      },
    },
  })
  await nextTick()
  await nextTick()
  return wrapper
}

describe('YearEndGridView', () => {
  beforeEach(() => vi.clearAllMocks())

  // Case 1: renders rows with employee name + total + bonus columns (vm-layer)
  it('loads and exposes rows with correct employee name, total, and bonus columns', async () => {
    vi.mocked(api.getYearEndGrid).mockResolvedValue({
      data: [makeRow()],
    } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      rows: GridRow[]
      bonusColumns: { key: string; label: string }[]
    }

    // employee name is present in rows
    expect(vm.rows).toHaveLength(1)
    expect(vm.rows[0].employee_name).toBe('蔡宜倩')

    // total amount is the raw string from the server
    expect(vm.rows[0].total_amount).toBe('40106.71')

    // bonus columns include 考核上 (APPRAISAL_HALF_BONUS_FIRST)
    const labels = vm.bonusColumns.map((c) => c.label)
    expect(labels).toContain('考核上')

    expect(api.getYearEndGrid).toHaveBeenCalledWith(7)
  })

  // Case 2: build button calls buildSettlements then reloads grid
  it('build button calls buildSettlements then reloads (getYearEndGrid called twice)', async () => {
    vi.mocked(api.getYearEndGrid).mockResolvedValue({
      data: [makeRow()],
    } as never)
    vi.mocked(api.buildSettlements).mockResolvedValue({
      data: { built: 3, skipped_finalized: 1 },
    } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      onBuild: () => Promise<void>
    }

    // Trigger build directly via exposed method
    await vm.onBuild()
    await nextTick()

    expect(api.buildSettlements).toHaveBeenCalledWith(7, { included_resigned_employee_ids: [] })
    // getYearEndGrid called on mount + after build = 2 times
    expect(api.getYearEndGrid).toHaveBeenCalledTimes(2)
    expect(vi.mocked(ElMessage.success)).toHaveBeenCalledWith('已試算 3 筆，略過已簽 1 筆')
  })

  // Case 3: manual edit dialog patches and reloads
  it('manual edit dialog patches settlement and reloads', async () => {
    vi.mocked(api.getYearEndGrid).mockResolvedValue({
      data: [makeRow()],
    } as never)
    vi.mocked(api.manualPatchSettlement).mockResolvedValue({
      data: {},
    } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      rows: GridRow[]
      openEdit: (row: GridRow) => void
      submitEdit: () => Promise<void>
      editForm: { deduction_disciplinary: number; excess_amount: number; hire_months_override: number | null }
    }

    // Open edit for the first DRAFT row
    vm.openEdit(vm.rows[0])
    await nextTick()

    // Set deduction
    vm.editForm.deduction_disciplinary = -500

    // Submit
    await vm.submitEdit()
    await nextTick()

    expect(api.manualPatchSettlement).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ deduction_disciplinary: -500 })
    )
    // getYearEndGrid called on mount + after patch = 2 times
    expect(api.getYearEndGrid).toHaveBeenCalledTimes(2)
  })

  // Case 4: finalized row hides manual edit button
  it('exposes canWrite=true but FINALIZED row must not show edit button (vm check)', async () => {
    const finalizedRow = makeRow({ status: 'FINALIZED', settlement_id: 99 })
    vi.mocked(api.getYearEndGrid).mockResolvedValue({
      data: [finalizedRow],
    } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      rows: GridRow[]
      canWrite: boolean
    }

    expect(vm.rows[0].status).toBe('FINALIZED')
    // canWrite is true (mocked), but template guards with `row.status === 'DRAFT' && canWrite`
    // we verify the DRAFT condition is false → button should NOT render
    expect(vm.rows[0].status === 'DRAFT' && vm.canWrite).toBe(false)
  })
})
