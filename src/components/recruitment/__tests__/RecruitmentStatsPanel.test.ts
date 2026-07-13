import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import RecruitmentStatsPanel from '../RecruitmentStatsPanel.vue'
import { createEmptyRecruitmentStats } from '@/composables/useRecruitmentDashboard'

function makeDashboard() {
  return {
    // useRecruitmentCharts 解構 stats.monthly/by_grade 等陣列；用 dashboard 預設空形狀避免 undefined.length
    stats: ref<Record<string, unknown>>(createEmptyRecruitmentStats() as Record<string, unknown>),
    options: ref<Record<string, unknown>>({ months: ['115.06'] }),
    loadingStats: ref(false),
    exportingExcel: ref(false),
    referenceMonth: ref<string | null>(null),
    invalidateOptions: vi.fn(),
    fetchOptions: vi.fn().mockResolvedValue(true),
    fetchStats: vi.fn().mockResolvedValue(true),
    loadDashboard: vi.fn(),
    setReferenceMonth: vi.fn(),
    handleExportExcel: vi.fn(),
  }
}

function mountPanel() {
  return mount(RecruitmentStatsPanel, {
    props: { dashboard: makeDashboard() as never },
    global: {
      plugins: [ElementPlus],
      stubs: {
        teleport: true,
        RecruitmentAreaTab: true,
        RecruitmentOverviewTab: true,
        RecruitmentNoDepositTab: true,
        RecruitmentPeriodsTab: true,
        RecruitmentClassTab: true,
        RecruitmentSourceTab: true,
        RecruitmentStaffTab: true,
        RecruitmentChuannianTab: true,
        AllChannelSummaryCard: true,
      },
    },
  })
}

describe('RecruitmentStatsPanel', () => {
  it('渲染 6 個統計次分頁', () => {
    const wrapper = mountPanel()
    const labels = wrapper.findAll('.el-tabs__item').map((n) => n.text())
    expect(labels).toEqual(
      expect.arrayContaining(['總覽', '班別分析', '來源分析', '接待分析', '區域分析', '未預繳原因']),
    )
    expect(labels).not.toContain('童年綠地')
    expect(labels).not.toContain('近五年轉換')
  })

  it('overview navigate target=detail 時 emit drill-records', async () => {
    const wrapper = mountPanel()
    const vm = wrapper.vm as unknown as { handleDashboardTarget: (t: Record<string, unknown>) => Promise<void> }
    await vm.handleDashboardTarget({ target_tab: 'detail', target_filter: { grade: '幼幼班' } })
    const emitted = wrapper.emitted('drill-records')
    expect(emitted).toBeTruthy()
    expect(emitted![0][0]).toEqual({ grade: '幼幼班' })
  })
})
