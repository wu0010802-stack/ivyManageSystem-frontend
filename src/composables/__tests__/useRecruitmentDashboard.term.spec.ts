import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useRecruitmentDashboard } from '@/composables/useRecruitmentDashboard'
import { getRecruitmentStats, getRecruitmentOptions } from '@/api/recruitment'

vi.mock('@/api/recruitment', () => ({
  getRecruitmentStats: vi.fn(),
  getRecruitmentOptions: vi.fn(),
}))

vi.mock('@/utils/download', () => ({
  downloadFile: vi.fn(),
}))

import { downloadFile } from '@/utils/download'

const mockGetStats = getRecruitmentStats as ReturnType<typeof vi.fn>
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _mockGetOptions = getRecruitmentOptions as ReturnType<typeof vi.fn>
const mockDownloadFile = downloadFile as ReturnType<typeof vi.fn>

const minimalStats = {
  total_visit: 0,
  total_deposit: 0,
  total_enrolled: 0,
  total_transfer_term: 0,
  total_pending_deposit: 0,
  total_effective_deposit: 0,
  unique_visit: 0,
  unique_deposit: 0,
  visit_to_deposit_rate: 0,
  visit_to_enrolled_rate: 0,
  deposit_to_enrolled_rate: 0,
  effective_to_enrolled_rate: 0,
  chuannian_visit: 0,
  chuannian_deposit: 0,
  monthly: [],
  by_grade: [],
  month_grade: {},
  by_source: [],
  by_referrer: [],
  by_district: [],
  referrer_source_cross: null,
  no_deposit_reasons: [],
  chuannian_by_expected: [],
  chuannian_by_grade: [],
  by_year: [],
  reference_month: null,
  decision_summary: { current_month: {}, rolling_30d: {}, rolling_90d: {}, ytd: {} },
  funnel_snapshot: { visit: 0, deposit: 0, enrolled: 0, transfer_term: 0, effective_deposit: 0, pending_deposit: 0 },
  month_over_month: { current_month: null, previous_month: null },
  alerts: [],
  top_action_queue: [],
}

describe('useRecruitmentDashboard — 入學學期篩選 (term params)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetStats.mockResolvedValue({ data: minimalStats })
    ;(getRecruitmentOptions as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    mockDownloadFile.mockResolvedValue(undefined)
  })

  it('school_year & semester 透傳到 getRecruitmentStats', async () => {
    const { statsSchoolYear, statsSemester, fetchStats } = useRecruitmentDashboard()
    statsSchoolYear.value = 115
    statsSemester.value = 1
    await fetchStats()
    expect(mockGetStats).toHaveBeenCalledOnce()
    expect(mockGetStats.mock.calls[0][0]).toMatchObject({ school_year: 115, semester: 1 })
  })

  it('只設 school_year 不設 semester：params 含 school_year 不含 semester', async () => {
    const { statsSchoolYear, fetchStats } = useRecruitmentDashboard()
    statsSchoolYear.value = 114
    await fetchStats()
    const calledParams = mockGetStats.mock.calls[0][0] as Record<string, unknown> | undefined
    expect(calledParams).toMatchObject({ school_year: 114 })
    expect(calledParams).not.toHaveProperty('semester')
  })

  it('兩者皆 null：params 不含 term 欄位', async () => {
    const { fetchStats } = useRecruitmentDashboard()
    await fetchStats()
    const calledParams = mockGetStats.mock.calls[0][0] as Record<string, unknown> | undefined
    expect(calledParams).toBeUndefined()
  })

  it('與 referenceMonth 同時傳：params 含所有三個欄位', async () => {
    const { statsSchoolYear, statsSemester, fetchStats } = useRecruitmentDashboard()
    statsSchoolYear.value = 115
    statsSemester.value = 2
    await fetchStats('115-09')
    expect(mockGetStats.mock.calls[0][0]).toMatchObject({
      reference_month: '115-09',
      school_year: 115,
      semester: 2,
    })
  })

  it('statsSchoolYear / statsSemester 是可寫的 ref（暴露於 return）', () => {
    const dashboard = useRecruitmentDashboard()
    expect(dashboard).toHaveProperty('statsSchoolYear')
    expect(dashboard).toHaveProperty('statsSemester')
    dashboard.statsSchoolYear.value = 115
    dashboard.statsSemester.value = 1
    expect(dashboard.statsSchoolYear.value).toBe(115)
    expect(dashboard.statsSemester.value).toBe(1)
  })

  it('handleExportExcel URL 含 school_year/semester', async () => {
    const { statsSchoolYear, statsSemester, handleExportExcel } = useRecruitmentDashboard()
    statsSchoolYear.value = 115
    statsSemester.value = 2
    await handleExportExcel()
    const url = mockDownloadFile.mock.calls[0][0] as string
    expect(url).toContain('school_year=115')
    expect(url).toContain('semester=2')
  })
})
