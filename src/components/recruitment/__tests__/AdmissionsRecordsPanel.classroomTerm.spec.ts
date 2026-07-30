/**
 * 招生「轉為學生」的編班選項跨學期正確性（2026-07-30 根因的第五處）。
 *
 * 招生轉入學多半發生在暑假，新生要編進的是「下個學年」的班；而後端 /classrooms 預設
 * 只回當期學期的班級，7 月時當期算 114-2，於是 115-1 的班一個都選不到。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import AdmissionsRecordsPanel from '../AdmissionsRecordsPanel.vue'
import type { useRecruitmentDashboard } from '@/composables/useRecruitmentDashboard'

const ALL_CLASSROOMS = [
  { id: 24, name: '向日葵', school_year: 114, semester: 2, semester_label: '114學年度下學期' },
  { id: 13, name: '天堂鳥', school_year: 115, semester: 1, semester_label: '115學年度上學期' },
  { id: 22, name: '向日葵', school_year: 115, semester: 1, semester_label: '115學年度上學期' },
]
const CURRENT_TERM_CLASSROOMS = ALL_CLASSROOMS.filter(c => c.school_year === 114)

vi.mock('@/api/classrooms', () => ({
  getClassrooms: vi.fn((params?: Record<string, unknown>) =>
    Promise.resolve({
      data: params?.current_only === false ? ALL_CLASSROOMS : CURRENT_TERM_CLASSROOMS,
    }),
  ),
  getGrades: vi.fn().mockResolvedValue({ data: [] }),
}))

const getRecruitmentRecordsMock = vi.hoisted(() => vi.fn())
vi.mock('@/api/recruitment', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, getRecruitmentRecords: getRecruitmentRecordsMock }
})

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

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

type Vm = {
  openConvertDialog: (row: Record<string, unknown>) => Promise<void>
  classroomOptions: { id: number; name: string; school_year?: number; semester?: number }[]
}

describe('AdmissionsRecordsPanel 編班選項跨學期', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    getRecruitmentRecordsMock.mockReset()
    getRecruitmentRecordsMock.mockResolvedValue({ data: { records: [], total: 0 } })
  })

  it('開啟轉為學生 dialog 時，編班選項含下學年的班', async () => {
    const wrapper = shallowMount(AdmissionsRecordsPanel, {
      props: {
        dashboard: makeDashboard() as unknown as ReturnType<typeof useRecruitmentDashboard>,
        filterPatch: null,
      },
      global: { stubs: { teleport: true, 'el-table-column': { template: '<span />' } } },
    })
    await flushPromises()

    const vm = wrapper.vm as unknown as Vm
    await vm.openConvertDialog({ id: 1, enrolled: false })
    await flushPromises()

    expect(vm.classroomOptions.map(c => c.id)).toEqual([24, 13, 22])
    // RecruitmentConvertDialog 的下拉自己組「班名（學年-學期）」標籤，
    // 所以這裡必須原樣保留 school_year/semester，不能只傳 id/name。
    expect(vm.classroomOptions.find(c => c.id === 13)).toMatchObject({
      name: '天堂鳥',
      school_year: 115,
      semester: 1,
    })
  })
})
