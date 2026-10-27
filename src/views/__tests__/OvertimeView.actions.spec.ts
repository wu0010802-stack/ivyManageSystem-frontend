import { describe, it, expect, vi, beforeEach } from 'vitest'

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
const perms = vi.hoisted(() => new Set<string>())
vi.mock('@/utils/auth', () => ({ hasPermission: (p: string) => perms.has(p), getUserInfo: () => ({ role: 'admin' }) }))
const confirmMock = vi.hoisted(() => vi.fn())
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: confirmMock, prompt: vi.fn() },
}))
// useApprovalOperation 內部會取 notification store（無 active pinia 會炸）
vi.mock('@/stores/notification', () => ({
  useNotificationStore: () => ({ fetchSummary: vi.fn() }),
}))

import OvertimeView from '@/views/OvertimeView.vue'
import { approveOvertime } from '@/api/overtimes'
import { buildOvertimeApproveConfirm } from '@/utils/overtimeApproveConfirm'

const globalStubs = {
  stubs: {
    'el-tabs': { template: '<div><slot /></div>' },
    'el-tab-pane': { template: '<div><slot /></div>' },
    'el-card': { template: '<div><slot /></div>' },
    LoadingPanel: { template: '<div><slot /></div>' },
    PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>' },
    'el-table': { name: 'ElTable', template: '<div class="el-table"><slot /></div>' },
    'el-table-column': { name: 'ElTableColumn', template: '<div></div>' },
  },
}

async function mountView() {
  const w = shallowMount(OvertimeView, { global: globalStubs })
  await flushPromises()
  await nextTick()
  return w
}

describe('buildOvertimeApproveConfirm', () => {
  it('計薪：寫出員工、日期、時數與加班費入薪', () => {
    expect(buildOvertimeApproveConfirm({ ...fakeOvertime, overtime_type_label: '平日' })).toBe(
      '核准 測試員工 2026-08-03 的平日加班 2h？核准後加班費 NT$500 會列入該月薪資。',
    )
    // 標籤已帶「加班」也不會疊字
    expect(buildOvertimeApproveConfirm(fakeOvertime)).toContain('的平日加班 2h')
  })
  it('補休：寫出給幾小時補休，不提加班費', () => {
    const msg = buildOvertimeApproveConfirm({ ...fakeOvertime, use_comp_leave: true })
    expect(msg).toContain('核准後會給 2h 補休')
    expect(msg).not.toContain('加班費')
  })
})

describe('OvertimeView 核准確認與權限', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    perms.clear()
    mockIsMobile.value = false
  })

  it('單筆核准先跳確認；取消就不送出', async () => {
    perms.add('OVERTIME_READ').add('OVERTIME_WRITE')
    const w = await mountView()
    confirmMock.mockRejectedValueOnce('cancel')
    await (w.vm as unknown as { approveOvertime: (r: unknown, a: boolean) => Promise<void> }).approveOvertime(fakeOvertime, true)
    expect(confirmMock).toHaveBeenCalledWith(expect.stringContaining('測試員工'), '核准加班', expect.anything())
    expect(approveOvertime).not.toHaveBeenCalled()
  })

  it('確認後才送出核准', async () => {
    perms.add('OVERTIME_READ').add('OVERTIME_WRITE')
    const w = await mountView()
    confirmMock.mockResolvedValueOnce('confirm')
    vi.mocked(approveOvertime).mockResolvedValueOnce({ data: {} } as never)
    await (w.vm as unknown as { approveOvertime: (r: unknown, a: boolean) => Promise<void> }).approveOvertime(fakeOvertime, true)
    expect(approveOvertime).toHaveBeenCalledWith(1, { approved: true })
  })

  it('只有讀取權限：不顯示新增、批次加班與匯入', async () => {
    perms.add('OVERTIME_READ')
    const w = await mountView()
    expect(w.findComponent({ name: 'AdminCreateButton' }).exists()).toBe(false)
    expect(w.html()).not.toContain('批次加班')
    expect(w.html()).not.toContain('匯入加班單')
  })

  it('有寫入權限：顯示新增加班', async () => {
    perms.add('OVERTIME_READ').add('OVERTIME_WRITE')
    const w = await mountView()
    expect(w.findComponent({ name: 'AdminCreateButton' }).exists()).toBe(true)
  })
})
