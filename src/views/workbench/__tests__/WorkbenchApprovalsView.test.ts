import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'

const mockIsMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({ useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }) }))

vi.mock('@/api/leaves', () => ({
  getLeaves: vi.fn().mockResolvedValue({ data: [] }),
  approveLeave: vi.fn(),
  getLeaveAttachment: vi.fn(),
  batchApproveLeaves: vi.fn().mockResolvedValue({ data: { succeeded: [1], failed: [] } }),
}))
vi.mock('@/api/overtimes', () => ({
  getOvertimes: vi.fn().mockResolvedValue({ data: [] }),
  approveOvertime: vi.fn(),
  batchApproveOvertimes: vi.fn().mockResolvedValue({ data: { succeeded: [], failed: [] } }),
}))
vi.mock('@/api/punchCorrections', () => ({
  getCorrections: vi.fn().mockResolvedValue({ data: [] }),
  approveCorrection: vi.fn(),
  batchApproveCorrections: vi.fn().mockResolvedValue({ data: { succeeded: [9], failed: [] } }),
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn().mockResolvedValue(true), prompt: vi.fn() },
}))
vi.mock('@/utils/auth', () => ({ getUserInfo: () => ({ role: 'admin' }), isSuperAdmin: () => false }))
vi.mock('@/stores/approvalPolicy', () => ({ useApprovalPolicyStore: () => ({ policies: [] }) }))
vi.mock('@/stores/notification', () => ({ useNotificationStore: () => ({ addNotification: vi.fn() }) }))

import WorkbenchApprovalsView from '@/views/workbench/WorkbenchApprovalsView.vue'
import * as punchCorrectionsApi from '@/api/punchCorrections'
import * as leavesApi from '@/api/leaves'
import * as overtimesApi from '@/api/overtimes'

const stubs = {
  teleport: true,
  'el-card': { template: '<div><slot name="header" /><slot /></div>' },
  'el-table': { name: 'ElTable', props: ['data'], template: '<div><slot /></div>' },
  'el-table-column': { template: '<div><slot :row="{}" /></div>' },
  'el-button': { template: '<button><slot /></button>' },
  'el-tag': true, 'el-badge': true, 'el-empty': true, 'el-icon': true, 'el-skeleton': true,
  'el-dialog': { props: ['modelValue'], template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>' },
  'el-tooltip': { template: '<div><slot /></div>' },
  TableSkeleton: true, LeaveBatchRejectDialog: true, 'router-link': true,
  AdminListToolbar: true,
}
const directives = { loading: () => {} }
const mountView = () => mount(WorkbenchApprovalsView, { global: { stubs, directives, mocks: { $router: { push: vi.fn() } } } })

describe('WorkbenchApprovalsView 批次核准', () => {
  beforeEach(() => vi.clearAllMocks())

  it('補打卡選取後批次核准帶 ids 呼叫 batchApproveCorrections', async () => {
    const wrapper = mountView()
    await flushPromises()
    const vm = wrapper.vm as unknown as {
      handleSelectionChangeC: (s: { id: number }[]) => void
      approveBatchC: () => Promise<void>
    }
    vm.handleSelectionChangeC([{ id: 9 }])
    await vm.approveBatchC()
    await flushPromises()
    expect(punchCorrectionsApi.batchApproveCorrections).toHaveBeenCalledWith([9], true)
  })

  it('補打卡批次駁回帶 approved=false + 原因', async () => {
    const wrapper = mountView()
    await flushPromises()
    const vm = wrapper.vm as unknown as {
      handleSelectionChangeC: (s: { id: number }[]) => void
      batchRejectReasonC: string
      confirmBatchRejectC: () => Promise<void>
    }
    vm.handleSelectionChangeC([{ id: 9 }])
    vm.batchRejectReasonC = '時間不符'
    await vm.confirmBatchRejectC()
    await flushPromises()
    expect(punchCorrectionsApi.batchApproveCorrections).toHaveBeenCalledWith([9], false, '時間不符')
  })
})

// ── 跨佇列關鍵字搜尋（客端過濾）─────────────────────────────────────────────
describe('WorkbenchApprovalsView 跨佇列搜尋', () => {
  beforeEach(() => vi.clearAllMocks())

  const leaves = [
    { id: 1, employee_name: '王小明', submitter_role: 'teacher' },
    { id: 2, employee_name: '李大華', submitter_role: 'teacher' },
  ]
  const overtimes = [
    { id: 3, employee_name: '王小明', submitter_role: 'teacher' },
    { id: 4, employee_name: '陳大同', submitter_role: 'teacher' },
  ]
  const corrections = [
    { id: 5, employee_name: '王小明', submitter_role: 'teacher' },
    { id: 6, employee_name: '林小美', submitter_role: 'teacher' },
  ]

  const mountWithData = async () => {
    vi.mocked(leavesApi.getLeaves).mockResolvedValueOnce({ data: leaves })
    vi.mocked(overtimesApi.getOvertimes).mockResolvedValueOnce({ data: overtimes })
    vi.mocked(punchCorrectionsApi.getCorrections).mockResolvedValueOnce({ data: corrections })
    const wrapper = mountView()
    await flushPromises()
    return wrapper
  }

  it('依姓名同時收斂三個待簽核佇列', async () => {
    const wrapper = await mountWithData()

    wrapper.vm.$.setupState.approvalSearch = '王小明'
    await flushPromises()

    expect(wrapper.vm.$.setupState.filteredLeaves).toEqual([leaves[0]])
    expect(wrapper.vm.$.setupState.filteredOvertimes).toEqual([overtimes[0]])
    expect(wrapper.vm.$.setupState.filteredCorrections).toEqual([corrections[0]])
    expect(wrapper.vm.$.setupState.approvalShown).toBe(3)
    expect(wrapper.vm.$.setupState.totalPending).toBe(6)
  })

  it('清空搜尋字串時三個佇列還原全部資料', async () => {
    const wrapper = await mountWithData()

    wrapper.vm.$.setupState.approvalSearch = '王小明'
    await flushPromises()
    wrapper.vm.$.setupState.approvalSearch = ''
    await flushPromises()

    expect(wrapper.vm.$.setupState.filteredLeaves).toEqual(leaves)
    expect(wrapper.vm.$.setupState.filteredOvertimes).toEqual(overtimes)
    expect(wrapper.vm.$.setupState.filteredCorrections).toEqual(corrections)
    expect(wrapper.vm.$.setupState.approvalShown).toBe(6)
  })
})

// ── 手機卡片化（比照 EmployeeListView 範式）─────────────────────────────────
describe('WorkbenchApprovalsView 手機卡片視圖', () => {
  const leaves = [{ id: 1, employee_name: '王小明', submitter_role: 'teacher' }]
  const overtimes = [
    { id: 3, employee_name: '陳大同', submitter_role: 'teacher' },
    { id: 4, employee_name: '林小美', submitter_role: 'teacher' },
  ]
  const corrections = [
    { id: 5, employee_name: '李大華', submitter_role: 'teacher' },
    { id: 6, employee_name: '張小玲', submitter_role: 'teacher' },
    { id: 7, employee_name: '吳小安', submitter_role: 'teacher' },
  ]

  const mountWithData = async () => {
    vi.mocked(leavesApi.getLeaves).mockResolvedValueOnce({ data: leaves })
    vi.mocked(overtimesApi.getOvertimes).mockResolvedValueOnce({ data: overtimes })
    vi.mocked(punchCorrectionsApi.getCorrections).mockResolvedValueOnce({ data: corrections })
    const wrapper = mountView()
    await flushPromises()
    return wrapper
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockIsMobile.value = false
  })

  it('isMobile=true 時三個佇列各渲染一個 AdminListCards，且 items 筆數正確', async () => {
    mockIsMobile.value = true
    const wrapper = await mountWithData()

    expect(wrapper.findComponent({ name: 'ElTable' }).exists()).toBe(false)

    const cards = wrapper.findAllComponents({ name: 'AdminListCards' })
    expect(cards).toHaveLength(3)
    expect((cards[0].props('items') as unknown[]).length).toBe(leaves.length)
    expect((cards[1].props('items') as unknown[]).length).toBe(overtimes.length)
    expect((cards[2].props('items') as unknown[]).length).toBe(corrections.length)
  })

  it('isMobile=false 時維持 el-table，不渲染 AdminListCards', async () => {
    mockIsMobile.value = false
    const wrapper = await mountWithData()

    expect(wrapper.findComponent({ name: 'AdminListCards' }).exists()).toBe(false)
    expect(wrapper.findAllComponents({ name: 'ElTable' })).toHaveLength(3)
  })
})
