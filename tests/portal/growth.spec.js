import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import {
  computeDelta,
  cycleLabel,
  gradeStyle,
  resolveEmptyState,
} from '@/composables/usePortalAppraisal'

vi.mock('@/api/portalAppraisal', () => ({
  getMyAppraisals: vi.fn(() =>
    Promise.resolve({
      data: {
        items: [
          {
            cycle_id: 2,
            academic_year: 113,
            semester: 'SECOND',
            start_date: '2025-02-01',
            end_date: '2025-07-31',
            cycle_status: 'OPEN',
            participant_id: 2,
            role_group: 'HEAD_TEACHER',
            is_excluded: false,
            exclude_reason: null,
            summary_status: 'DRAFT',
            is_rejected: false,
            is_visible: false,
            total_score: null,
            grade: null,
            bonus_amount: null,
          },
        ],
      },
    }),
  ),
  getMyAppraisalTrend: vi.fn(() => Promise.resolve({ data: { points: [] } })),
  getMyAppraisalDetail: vi.fn(),
}))

describe('usePortalAppraisal — pure helpers', () => {
  it('cycleLabel formats academic year + semester to ROC label', () => {
    expect(cycleLabel(114, 'FIRST')).toBe('114上')
    expect(cycleLabel(114, 'SECOND')).toBe('114下')
  })

  it('gradeStyle maps 5 grades to CSS class', () => {
    expect(gradeStyle('OUTSTANDING').className).toBe('grade-outstanding')
    expect(gradeStyle('GOOD').className).toBe('grade-good')
    expect(gradeStyle('PASS').className).toBe('grade-pass')
    expect(gradeStyle('WARN').className).toBe('grade-warn')
    expect(gradeStyle('FAIL').className).toBe('grade-fail')
    expect(gradeStyle(null).className).toBe('grade-unknown')
  })

  it('computeDelta returns null when no previous visible cycle', () => {
    const items = [
      { is_visible: true, total_score: '85' },
    ]
    expect(computeDelta(items, 0)).toBeNull()
  })

  it('computeDelta skips non-visible cycles when finding previous', () => {
    // 倒序 list（API 回傳就是 DESC）：index 0 是最新
    const items = [
      { is_visible: true, total_score: '90' },     // 114上 最新
      { is_visible: false, total_score: null },    // 113下 進行中
      { is_visible: true, total_score: '85' },     // 113上
    ]
    // 計算 114上 相對於上一個 visible (113上) 的 delta
    expect(computeDelta(items, 0)).toBe(5)
  })

  it('resolveEmptyState identifies empty / all-pending / has-finalized', () => {
    expect(resolveEmptyState([])).toBe('no-data')
    expect(
      resolveEmptyState([
        { is_visible: false, is_excluded: false },
        { is_visible: false, is_excluded: true },
      ]),
    ).toBe('all-pending')
    expect(
      resolveEmptyState([{ is_visible: true }, { is_visible: false }]),
    ).toBe('has-finalized')
  })
})

describe('PortalGrowthView — empty / all-pending', () => {
  it('hides TrendChart and shows pending hint when no finalized cycle', async () => {
    const { default: PortalGrowthView } = await import(
      '@/views/portal/PortalGrowthView.vue'
    )
    const wrapper = mount(PortalGrowthView, {
      global: {
        stubs: {
          'el-button': true,
          TrendChart: true,
          LatestSummaryCard: true,
          CycleTimelineItem: true,
        },
      },
    })
    await flushPromises()
    const html = wrapper.html()
    expect(html).toContain('歷年紀錄')
    expect(html).toContain('考核進行中')
    // TrendChart 不該出現（全 DRAFT 時）
    expect(html).not.toContain('歷年趨勢')
  })
})

describe('PortalGrowthView — has-finalized', () => {
  it('renders TrendChart and LatestSummaryCard when at least one cycle is finalized', async () => {
    vi.resetModules()
    vi.doMock('@/api/portalAppraisal', () => ({
      getMyAppraisals: vi.fn(() =>
        Promise.resolve({
          data: {
            items: [
              {
                cycle_id: 1, academic_year: 114, semester: 'FIRST',
                start_date: '2025-08-01', end_date: '2026-01-31',
                cycle_status: 'CLOSED', participant_id: 1, role_group: 'HEAD_TEACHER',
                is_excluded: false, exclude_reason: null,
                summary_status: 'FINALIZED', is_rejected: false, is_visible: true,
                total_score: '90', grade: 'OUTSTANDING', bonus_amount: '8000',
              },
            ],
          },
        }),
      ),
      getMyAppraisalTrend: vi.fn(() =>
        Promise.resolve({
          data: {
            points: [
              { cycle_id: 1, academic_year: 114, semester: 'FIRST',
                label: '114上', total_score: '90', base_score: '70',
                event_score_sum: '20', grade: 'OUTSTANDING' },
            ],
          },
        }),
      ),
      getMyAppraisalDetail: vi.fn(),
    }))
    const { default: PortalGrowthView } = await import(
      '@/views/portal/PortalGrowthView.vue'
    )
    const wrapper = mount(PortalGrowthView, {
      global: {
        stubs: {
          'el-button': true,
          TrendChart: true,
          LatestSummaryCard: true,
          CycleTimelineItem: true,
        },
      },
    })
    await flushPromises()
    const html = wrapper.html()
    expect(html).toContain('歷年趨勢')
    expect(html).toContain('latest-summary-card-stub')
    expect(html).toContain('trend-chart-stub')
  })
})
