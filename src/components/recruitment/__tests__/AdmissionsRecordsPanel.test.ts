import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { createPinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import AdmissionsRecordsPanel from '../AdmissionsRecordsPanel.vue'
import type { useRecruitmentDashboard } from '@/composables/useRecruitmentDashboard'

const getRecruitmentRecordsMock = vi.hoisted(() => vi.fn())
const deleteRecruitmentRecordMock = vi.hoisted(() => vi.fn())
vi.mock('@/api/recruitment', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    getRecruitmentRecords: getRecruitmentRecordsMock,
    deleteRecruitmentRecord: deleteRecruitmentRecordMock,
  }
})
vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    ElMessageBox: { confirm: vi.fn().mockResolvedValue('confirm') },
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

function mountPanel(filterPatch: Record<string, unknown> | null = null) {
  return mount(AdmissionsRecordsPanel, {
    props: {
      dashboard: makeDashboard() as unknown as ReturnType<typeof useRecruitmentDashboard>,
      filterPatch,
    },
    global: {
      plugins: [createPinia()],
      // RecruitmentDetailTab 的 el-table slot 在 happy-dom 下 render 會炸（非被測行為），
      // stub 掉重子元件；fetchDetail/handleDelete/filterPatch watch 皆為 panel 層邏輯不受影響
      stubs: { teleport: true, RecruitmentDetailTab: true, RecruitmentMonthDialog: true },
    },
  })
}

describe('AdmissionsRecordsPanel', () => {
  beforeEach(() => {
    getRecruitmentRecordsMock.mockReset()
    getRecruitmentRecordsMock.mockResolvedValue({ data: { records: [], total: 0 } })
    deleteRecruitmentRecordMock.mockReset()
    deleteRecruitmentRecordMock.mockResolvedValue({ data: {} })
  })

  it('mount 時抓訪視明細', async () => {
    mountPanel()
    await flushPromises()
    expect(getRecruitmentRecordsMock).toHaveBeenCalled()
  })

  it('filterPatch prop 變更時套用篩選並重抓（下鑽）', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    getRecruitmentRecordsMock.mockClear()
    await wrapper.setProps({ filterPatch: { keyword: '王小明' } })
    await flushPromises()
    expect(getRecruitmentRecordsMock).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: '王小明', page: 1 }),
    )
  })

  it('刪除成功後 emit changed', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    const vm = wrapper.vm as unknown as { handleDelete: (id: number) => Promise<void> }
    await vm.handleDelete(5)
    await flushPromises()
    expect(deleteRecruitmentRecordMock).toHaveBeenCalledWith(5)
    expect(wrapper.emitted('changed')).toBeTruthy()
  })
})
