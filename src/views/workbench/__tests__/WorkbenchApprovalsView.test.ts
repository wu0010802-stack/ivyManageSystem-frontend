import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

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

const stubs = {
  teleport: true,
  'el-card': { template: '<div><slot name="header" /><slot /></div>' },
  'el-table': { props: ['data'], template: '<div><slot /></div>' },
  'el-table-column': { template: '<div><slot :row="{}" /></div>' },
  'el-button': { template: '<button><slot /></button>' },
  'el-tag': true, 'el-badge': true, 'el-empty': true, 'el-icon': true,
  'el-dialog': { props: ['modelValue'], template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>' },
  'el-tooltip': { template: '<div><slot /></div>' },
  TableSkeleton: true, LeaveBatchRejectDialog: true, 'router-link': true,
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
