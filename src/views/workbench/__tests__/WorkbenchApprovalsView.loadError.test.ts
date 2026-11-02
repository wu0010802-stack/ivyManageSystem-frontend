import { describe, it, expect, vi, beforeEach } from 'vitest'

// 「園方的一天」實機走查 F6（2026-11-02）：首次進審核工作台時請假清單沒載到（背景
// 靜默刷新吞掉錯誤），畫面卻顯示綠色「0 筆待審」與「3 項待審核」；同時儀表板寫
// 待審請假 7。按「重新整理」才變成 7 筆——主管會以為沒有假單要簽。
const paged = vi.hoisted(
  () =>
    <T,>(items: T[]) => ({ items, total: items.length, page: 1, pageSize: 5000, hasMore: false }),
)

import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('@/composables/useIsMobile', () => ({ useIsMobile: () => ({ isMobile: ref(false), cleanup: () => {} }) }))
vi.mock('@/api/leaves', () => ({
  getLeaves: vi.fn(),
  approveLeave: vi.fn(),
  getLeaveAttachment: vi.fn(),
  batchApproveLeaves: vi.fn(),
}))
vi.mock('@/api/overtimes', () => ({
  getOvertimes: vi.fn().mockResolvedValue(paged([])),
  approveOvertime: vi.fn(),
  batchApproveOvertimes: vi.fn(),
}))
vi.mock('@/api/punchCorrections', () => ({
  getCorrections: vi.fn().mockResolvedValue(paged([{ id: 9, employee_name: '甲' }])),
  approveCorrection: vi.fn(),
  batchApproveCorrections: vi.fn(),
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn().mockResolvedValue(true), prompt: vi.fn() },
}))
vi.mock('@/utils/auth', () => ({ getUserInfo: () => ({ role: 'admin' }), isSuperAdmin: () => false, hasPermission: () => false, canAccessRoute: () => false }))
vi.mock('@/stores/approvalPolicy', () => ({ useApprovalPolicyStore: () => ({ policies: [] }) }))
vi.mock('@/stores/notification', () => ({ useNotificationStore: () => ({ addNotification: vi.fn() }) }))

import WorkbenchApprovalsView from '@/views/workbench/WorkbenchApprovalsView.vue'
import * as leavesApi from '@/api/leaves'

const stubs = {
  teleport: true,
  'el-card': { template: '<div><slot name="header" /><slot /></div>' },
  'el-table': { name: 'ElTable', props: ['data'], template: '<div><slot /></div>' },
  'el-table-column': { template: '<div><slot :row="{}" /></div>' },
  'el-button': { template: '<button><slot /></button>' },
  'el-tag': { template: '<span class="tag"><slot /></span>' },
  'el-alert': { props: ['title', 'description'], template: '<div class="alert">{{ title }} {{ description }}</div>' },
  'el-badge': true, 'el-empty': true, 'el-icon': true, 'el-skeleton': true,
  'el-dialog': { props: ['modelValue'], template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>' },
  'el-tooltip': { template: '<div><slot /></div>' },
  TableSkeleton: true, LeaveBatchRejectDialog: true, 'router-link': true,
  AdminListToolbar: true, OtherSignoffsStrip: { template: '<div />', methods: { reload() {} } }, PageHeader: { template: '<div><slot name="actions" /></div>' },
}
const mountView = () =>
  mount(WorkbenchApprovalsView, { global: { stubs, directives: { loading: () => {} }, mocks: { $router: { push: vi.fn() } } } })

describe('審核工作台載入失敗（day-qa F6）', () => {
  beforeEach(() => vi.clearAllMocks())

  it('請假清單載入失敗時顯示「載入失敗」，不得顯示成 0 筆待審或全部已處理', async () => {
    vi.mocked(leavesApi.getLeaves).mockRejectedValue(new Error('timeout'))
    const wrapper = mountView()
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('載入失敗')
    expect(text).toContain('有待審清單沒有載入成功')
    // 請假卡顯示「載入失敗」；加班確實是 0 筆、補打卡 1 筆，照實顯示
    expect(wrapper.findAll('.tag').map((t) => t.text())).toEqual(
      expect.arrayContaining(['部分清單載入失敗', '載入失敗', '0 筆待審', '1 筆待審']),
    )
    expect(wrapper.findAll('.tag').filter((t) => t.text() === '0 筆待審')).toHaveLength(1)
    expect(text).not.toContain('全部已處理')
    wrapper.unmount()
  })

  it('重新整理成功後錯誤狀態解除、顯示實際筆數', async () => {
    vi.mocked(leavesApi.getLeaves).mockRejectedValueOnce(new Error('timeout'))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('載入失敗')

    vi.mocked(leavesApi.getLeaves).mockResolvedValue(paged([{ id: 1, employee_name: '乙' }]) as never)
    const refresh = wrapper.findAll('button').find((b) => b.text() === '重新整理')
    await refresh!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).not.toContain('有待審清單沒有載入成功')
    expect(wrapper.findAll('.tag').map((t) => t.text())).toContain('1 筆待審')
    wrapper.unmount()
  })

  it('沒有某份清單的讀取權（403）不算載入失敗，不顯示錯誤提示', async () => {
    vi.mocked(leavesApi.getLeaves).mockRejectedValue({ response: { status: 403, data: { detail: '權限不足' } } })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).not.toContain('有待審清單沒有載入成功')
    expect(wrapper.text()).not.toContain('部分清單載入失敗')
    wrapper.unmount()
  })
})

