import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createEmptyRecruitmentStats } from '@/composables/useRecruitmentDashboard'

/**
 * F65（MT-59）：招生「區域分析」的本園座標三層優先序是
 * 後端 campus 設定 > 品牌 API 的 per-tenant 座標 > （以前）義華硬編座標。
 * 後端對非預設租戶刻意不給座標（「B 校生活圈以義華經緯度為圓心，錯得很像真的」），
 * 前端最後一層不得再把義華座標補回去；預設租戶（branding.map 恆有值）行為不變。
 */
const brandingMap = vi.hoisted(() => ({
  current: { lat: 22.642, lng: 120.3243 } as { lat: number; lng: number } | null,
}))
vi.mock('@/composables/useTenantBranding', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/composables/useTenantBranding')>()
  const current = () => ({ ...actual.BRANDING_DEFAULTS, map: brandingMap.current })
  return {
    ...actual,
    getBranding: current,
    useTenantBranding: () => ({ branding: ref(current()) }),
  }
})

import RecruitmentStatsPanel from '../RecruitmentStatsPanel.vue'

function makeDashboard() {
  return {
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

function currentCampus() {
  const wrapper = mount(RecruitmentStatsPanel, {
    props: { dashboard: makeDashboard() as never },
    global: {
      plugins: [ElementPlus],
      stubs: {
        teleport: true,
        RecruitmentAreaTab: true,
        RecruitmentOverviewTab: true,
        RecruitmentNoDepositTab: true,
        RecruitmentClassTab: true,
        RecruitmentSourceTab: true,
        RecruitmentStaffTab: true,
        AllChannelSummaryCard: true,
      },
    },
  })
  return (wrapper.vm as unknown as { currentCampus: { campus_lat: unknown; campus_lng: unknown } }).currentCampus
}

describe('RecruitmentStatsPanel 本園座標 fallback（F65）', () => {
  beforeEach(() => {
    brandingMap.current = { lat: 22.642, lng: 120.3243 }
  })

  it('預設租戶：後端未給座標時仍退回 branding.map（原行為）', () => {
    const campus = currentCampus()
    expect(campus.campus_lat).toBe(22.642)
    expect(campus.campus_lng).toBe(120.3243)
  })

  it('非預設租戶未設座標（branding.map 為 null）：本園座標留空，不退回義華的 22.642／120.3243', () => {
    brandingMap.current = null
    const campus = currentCampus()
    expect(campus.campus_lat).toBeNull()
    expect(campus.campus_lng).toBeNull()
  })

  it('非預設租戶有設座標：用該租戶自己的座標', () => {
    brandingMap.current = { lat: 22.73, lng: 120.33 }
    const campus = currentCampus()
    expect(campus.campus_lat).toBe(22.73)
    expect(campus.campus_lng).toBe(120.33)
  })
})
