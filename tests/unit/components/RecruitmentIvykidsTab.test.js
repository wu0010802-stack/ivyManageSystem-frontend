import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import RecruitmentIvykidsTab from '@/components/recruitment/RecruitmentIvykidsTab.vue'

const getRecruitmentIvykidsBackendStatus = vi.fn()
const getRecruitmentIvykidsStats = vi.fn()
const getRecruitmentIvykidsRecords = vi.fn()
const syncRecruitmentIvykidsBackend = vi.fn()
const deleteRecruitmentIvykidsBackendRecords = vi.fn()

vi.mock('element-plus', () => ({
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
  ElMessageBox: {
    confirm: vi.fn(() => Promise.resolve()),
  },
}))

vi.mock('@/api/recruitmentIvykids', () => ({
  getRecruitmentIvykidsBackendStatus: (...args) => getRecruitmentIvykidsBackendStatus(...args),
  getRecruitmentIvykidsStats: (...args) => getRecruitmentIvykidsStats(...args),
  getRecruitmentIvykidsRecords: (...args) => getRecruitmentIvykidsRecords(...args),
  syncRecruitmentIvykidsBackend: (...args) => syncRecruitmentIvykidsBackend(...args),
  deleteRecruitmentIvykidsBackendRecords: (...args) => deleteRecruitmentIvykidsBackendRecords(...args),
}))

vi.mock('@/utils/error', () => ({
  apiError: vi.fn((_error, fallback) => fallback),
}))

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

const routerSource = readFileSync(resolve(process.cwd(), 'src/router/index.js'), 'utf8')
const sidebarSource = readFileSync(resolve(process.cwd(), 'src/components/layout/AdminSidebar.vue'), 'utf8')
const authSource = readFileSync(resolve(process.cwd(), 'src/utils/auth.js'), 'utf8')

describe('RecruitmentIvykidsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRecruitmentIvykidsBackendStatus.mockResolvedValue({
      data: {
        provider_label: '義華校官網',
        sync_in_progress: false,
        last_sync_status: 'success',
        last_synced_at: '2026-04-13T08:00:00',
        last_sync_counts: { inserted: 1, updated: 0, skipped: 0 },
      },
    })
    getRecruitmentIvykidsStats.mockResolvedValue({
      data: {
        total_visit: 1,
        total_deposit: 1,
        total_enrolled: 0,
        by_source: [{ source: '官網預約', visit: 1, deposit: 1 }],
        by_month: [{ month: '115.04', visit: 1, deposit: 1, enrolled: 0 }],
      },
    })
    getRecruitmentIvykidsRecords.mockResolvedValue({
      data: {
        total: 1,
        records: [
          {
            id: 1,
            child_name: '小安',
            month: '115.04',
            visit_date: '2026-04-12 10:30',
            phone: '0912000111',
            source: '官網預約',
            external_status: '預約正常',
            external_created_at: '2026-04-10 09:15',
            has_deposit: true,
          },
        ],
      },
    })
    syncRecruitmentIvykidsBackend.mockResolvedValue({ data: { message: '同步完成' } })
    deleteRecruitmentIvykidsBackendRecords.mockResolvedValue({ data: { deleted: 1 } })
  })

  it('掛載時會載入同步狀態、統計與明細', async () => {
    const wrapper = shallowMount(RecruitmentIvykidsTab, {
      props: {
        barComponent: { name: 'BarStub', template: '<div />' },
        showCharts: true,
        canWrite: true,
      },
      global: {
        directives: {
          loading: () => {},
        },
        stubs: {
          'el-card': { template: '<div><slot name="header" /><slot /></div>' },
          'el-table': { template: '<div><slot /></div>' },
          'el-table-column': { template: '<div><slot :row="{}" /></div>' },
          'el-tag': { template: '<span><slot /></span>' },
          'el-button': { template: '<button><slot /></button>' },
          'el-select': { template: '<div><slot /></div>' },
          'el-option': true,
          'el-empty': true,
          'el-pagination': true,
        },
      },
    })

    await flushPromises()

    expect(getRecruitmentIvykidsBackendStatus).toHaveBeenCalledTimes(1)
    expect(getRecruitmentIvykidsStats).toHaveBeenCalledTimes(1)
    expect(getRecruitmentIvykidsRecords).toHaveBeenCalledWith({ page: 1, page_size: 50 })
    expect(wrapper.text()).toContain('共 1 筆')
  })

  it('保留獨立路由與側邊欄入口', () => {
    expect(routerSource).toContain("path: '/recruitment-ivykids'")
    expect(routerSource).toContain("meta: { title: '官網報名' }")
    expect(sidebarSource).toContain('index="/recruitment-ivykids"')
    expect(sidebarSource).toContain('官網報名')
    expect(authSource).toContain("{ path: '/recruitment-ivykids', permission: 'RECRUITMENT_READ' }")
  })
})
