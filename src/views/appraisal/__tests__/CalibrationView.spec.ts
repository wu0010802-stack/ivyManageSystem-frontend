import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import CalibrationView from '../CalibrationView.vue'

vi.mock('@/api/appraisal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/appraisal')>()
  return {
    ...actual,
    listAppraisalCycles: vi.fn(),
    getGradeDistribution: vi.fn(),
  }
})

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

import * as api from '@/api/appraisal'

// ---- helpers ----

const mockCycle = (overrides: Record<string, unknown> = {}) => ({
  id: 2,
  academic_year: 114,
  semester: 'FIRST',
  status: 'OPEN',
  ...overrides,
})

function makeBuckets(counts: Partial<Record<string, number>>, total: number) {
  const order = ['OUTSTANDING', 'GOOD', 'PASS', 'WARN', 'FAIL']
  return order.map((grade) => {
    const count = counts[grade] ?? 0
    return {
      grade,
      count,
      ratio: total > 0 ? (count / total).toFixed(4) : '0',
    }
  })
}

const mockRow = (overrides: Record<string, unknown> = {}) => ({
  participant_id: 1,
  employee_id: 10,
  employee_name: '王老師',
  role_group: 'HEAD_TEACHER',
  total_score: '92',
  grade: 'OUTSTANDING',
  bonus_amount: '8000',
  status: 'DRAFT',
  prev_total_score: '75',
  prev_grade: 'PASS',
  score_delta: '17',
  ...overrides,
})

function mockDistribution(overrides: Record<string, unknown> = {}) {
  return {
    current: {
      cycle_id: 2, academic_year: 114, semester: 'FIRST', total_count: 3,
      buckets: makeBuckets({ OUTSTANDING: 1, GOOD: 1, FAIL: 1 }, 3),
    },
    previous: {
      cycle_id: 1, academic_year: 113, semester: 'SECOND', total_count: 2,
      buckets: makeBuckets({ PASS: 1, GOOD: 1 }, 2),
    },
    rows: [
      mockRow(),
      mockRow({ participant_id: 2, employee_id: 11, employee_name: '林老師', total_score: '83', grade: 'GOOD', bonus_amount: '6000', prev_total_score: '85', prev_grade: 'GOOD', score_delta: '-2' }),
      mockRow({ participant_id: 3, employee_id: 12, employee_name: '陳老師', total_score: '55', grade: 'FAIL', bonus_amount: '0', prev_total_score: null, prev_grade: null, score_delta: null }),
    ],
    ...overrides,
  }
}

async function mountView() {
  const wrapper = mount(CalibrationView, {
    global: {
      stubs: {
        'el-select': true, 'el-option': true, 'el-alert': true, 'el-tag': true,
        'el-table': true, 'el-table-column': true, 'el-button': true,
        'el-progress': true, 'el-empty': true,
      },
      directives: { loading: () => {} },
    },
  })
  await flushPromises()
  await nextTick()
  return wrapper
}

interface CalibrationVm {
  selectedCycleId: number | null
  data: ReturnType<typeof mockDistribution> | null
  loadError: boolean
  ratioWarnings: string[]
  attentionRows: { employee_name: string }[]
  reload: () => Promise<void>
}

describe('CalibrationView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.listAppraisalCycles).mockResolvedValue({
      data: [
        mockCycle({ id: 1, academic_year: 113, semester: 'SECOND' }),
        mockCycle({ id: 2, academic_year: 114, semester: 'FIRST' }),
      ],
    } as never)
    vi.mocked(api.getGradeDistribution).mockResolvedValue({ data: mockDistribution() } as never)
  })

  it('mount 預設選最新週期並載入分布', async () => {
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as CalibrationVm

    // 114上 比 113下 新 → 預設選 id=2
    expect(vm.selectedCycleId).toBe(2)
    expect(api.getGradeDistribution).toHaveBeenCalledWith(2)
    expect(vm.data?.current.total_count).toBe(3)
  })

  it('柔性警示：等第比例與上期差逾 15 個百分點才提示', async () => {
    // 本期 OUTSTANDING 33.33% vs 上期 0% → +33pp 警示；GOOD 33.33% vs 50% → -17pp 警示
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as CalibrationVm

    const text = vm.ratioWarnings.join('；')
    expect(text).toContain('優等')
    expect(text).toContain('增加')
    // FAIL 33.33% vs 0% → 也應警示
    expect(text).toContain('丁等')
  })

  it('無上期資料 → 不產生比例警示', async () => {
    vi.mocked(api.getGradeDistribution).mockResolvedValue({
      data: mockDistribution({ previous: null }),
    } as never)
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as CalibrationVm

    expect(vm.ratioWarnings).toEqual([])
  })

  it('需注意名單：|Δ|≥10 或 丙/丁等 才列入', async () => {
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as CalibrationVm

    const names = vm.attentionRows.map((r) => r.employee_name)
    expect(names).toContain('王老師') // Δ+17
    expect(names).toContain('陳老師') // FAIL
    expect(names).not.toContain('林老師') // Δ-2 且 GOOD
  })

  it('分布載入失敗 → loadError 可重試（不靜默）', async () => {
    vi.mocked(api.getGradeDistribution).mockRejectedValueOnce(new Error('network'))
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as CalibrationVm

    expect(vm.loadError).toBe(true)
    expect(wrapper.find('[data-test="calibration-load-error"]').exists()).toBe(true)

    await vm.reload()
    await flushPromises()
    expect(vm.loadError).toBe(false)
    expect(vm.data).not.toBeNull()
  })

  it('切換週期 → 重新載入分布', async () => {
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as CalibrationVm
    vi.mocked(api.getGradeDistribution).mockClear()

    vm.selectedCycleId = 1
    await nextTick()
    await flushPromises()

    expect(api.getGradeDistribution).toHaveBeenCalledWith(1)
  })
})
