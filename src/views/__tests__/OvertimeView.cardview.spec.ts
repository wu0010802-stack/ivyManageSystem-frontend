import { describe, it, expect, vi } from 'vitest'

// 分頁契約 mock helper（vi.hoisted：vi.mock factory 會被提升到檔頭）。
// 抄 src/api/_pagination.ts 的 PagedResult 形狀——三支列表 api 回的是它，
// 不是 AxiosResponse；mock 若還用 { data } 會靜默給出空清單（假綠）。
const paged = vi.hoisted(
  () =>
    <T,>(items: T[]) => ({
      items,
      total: items.length,
      page: 1,
      pageSize: 5000,
      hasMore: false,
    }),
)

import { ref, nextTick } from 'vue'
import { shallowMount, flushPromises } from '@vue/test-utils'

const mockIsMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({ useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }) }))

// getOvertimes 同時供主清單與 useFetchPending 使用；回一筆待審資料讓「待審核項目」卡也渲染
const fakeOvertime = {
  id: 1,
  employee_name: '測試員工',
  overtime_date: '2026-08-03',
  overtime_type: 'weekday',
  overtime_type_label: '平日加班',
  start_time: '18:00',
  end_time: '20:00',
  hours: 2,
  use_comp_leave: false,
  overtime_pay: 500,
  reason: '活動籌備',
  status: 'pending',
}
vi.mock('@/api/overtimes', () => ({
  getOvertimes: vi.fn(() => Promise.resolve(paged([fakeOvertime]))),
  createOvertime: vi.fn(),
  updateOvertime: vi.fn(),
  approveOvertime: vi.fn(),
  batchApproveOvertimes: vi.fn(),
  getOvertimeImportTemplate: vi.fn(),
  importOvertimes: vi.fn(),
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/stores/employee', () => ({
  useEmployeeStore: () => ({ employees: [], fetchEmployees: vi.fn(() => Promise.resolve()) }),
}))
vi.mock('@/stores/approvalPolicy', () => ({
  useApprovalPolicyStore: () => ({ policies: [], fetchPolicies: vi.fn(() => Promise.resolve()) }),
}))
// canViewOvertime gate（OVERTIME_READ）擋整個 tab-pane，測試一律放行
vi.mock('@/utils/auth', () => ({ hasPermission: () => true, getUserInfo: () => null }))
// useApprovalOperation 內部會取 notification store（無 active pinia 會炸）
vi.mock('@/stores/notification', () => ({
  useNotificationStore: () => ({ fetchSummary: vi.fn() }),
}))

import OvertimeView from '@/views/OvertimeView.vue'

const globalStubs = {
  stubs: {
    'el-tabs': { template: '<div><slot /></div>' },
    'el-tab-pane': { template: '<div><slot /></div>' },
    'el-card': { template: '<div><slot /></div>' },
    LoadingPanel: { template: '<div><slot /></div>' },
    'el-table': { name: 'ElTable', template: '<div class="el-table"><slot /></div>' },
    'el-table-column': { name: 'ElTableColumn', template: '<div></div>' },
  },
}

describe('OvertimeView 手機卡片切換', () => {
  it('桌機顯示 el-table、手機顯示 AdminListCards（主清單＋待審卡）', async () => {
    mockIsMobile.value = false
    const w = shallowMount(OvertimeView, { global: globalStubs })
    await flushPromises()
    await nextTick()
    // 桌機：主清單＋待審核項目兩張表
    expect(w.findAll('.el-table').length).toBeGreaterThanOrEqual(2)
    expect(w.findAllComponents({ name: 'AdminListCards' }).length).toBe(0)

    mockIsMobile.value = true
    await nextTick()
    // 手機：兩張表都換成卡片
    expect(w.findAllComponents({ name: 'AdminListCards' }).length).toBeGreaterThanOrEqual(2)
    expect(w.find('.el-table').exists()).toBe(false)
  })
})
