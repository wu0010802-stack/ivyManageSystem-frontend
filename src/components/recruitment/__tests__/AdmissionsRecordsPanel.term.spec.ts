import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { createPinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import AdmissionsRecordsPanel from '../AdmissionsRecordsPanel.vue'
import type { useRecruitmentDashboard } from '@/composables/useRecruitmentDashboard'

const getRecruitmentRecordsMock = vi.hoisted(() => vi.fn())
vi.mock('@/api/recruitment', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    getRecruitmentRecords: getRecruitmentRecordsMock,
  }
})
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

function makeDashboard() {
  return {
    stats: ref<Record<string, unknown>>({ by_district: [] }),
    options: ref<Record<string, unknown>>({ months: [], sources: [], referrers: [], no_deposit_reasons: [] }),
    loadingStats: ref(false),
    invalidateOptions: vi.fn(),
    fetchOptions: vi.fn().mockResolvedValue(true),
    fetchStats: vi.fn().mockResolvedValue(true),
    loadDashboard: vi.fn(),
    setReferenceMonth: vi.fn(),
    handleExportExcel: vi.fn(),
  }
}

describe('AdmissionsRecordsPanel 學期篩選', () => {
  beforeEach(() => {
    getRecruitmentRecordsMock.mockReset()
    getRecruitmentRecordsMock.mockResolvedValue({ data: { records: [], total: 0 } })
  })

  it('fetchDetail 帶 school_year/semester 進 getRecruitmentRecords', async () => {
    const wrapper = mount(AdmissionsRecordsPanel, {
      props: {
        dashboard: makeDashboard() as unknown as ReturnType<typeof useRecruitmentDashboard>,
        filterPatch: null,
      },
      global: {
        plugins: [createPinia()],
        // stub heavy child components; panel-layer logic (fetchDetail/filterPatch watch) unaffected
        stubs: { teleport: true, RecruitmentDetailTab: true, RecruitmentMonthDialog: true },
      },
    })
    await flushPromises()
    getRecruitmentRecordsMock.mockClear()

    // filterPatch prop change triggers watch → sets filter.school_year/semester → calls fetchDetail
    await wrapper.setProps({ filterPatch: { school_year: 115, semester: 1 } })
    await flushPromises()

    expect(getRecruitmentRecordsMock).toHaveBeenCalledWith(
      expect.objectContaining({ school_year: 115, semester: 1 }),
    )
  })
})
