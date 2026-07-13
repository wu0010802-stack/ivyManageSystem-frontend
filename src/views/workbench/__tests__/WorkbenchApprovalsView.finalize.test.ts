import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { ElMessageBox } from 'element-plus'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

vi.mock('@/api/leaves', () => ({
  getLeaves: vi.fn().mockResolvedValue({ data: [] }),
  approveLeave: vi.fn().mockResolvedValue({ data: {} }),
  getLeaveAttachment: vi.fn(),
  batchApproveLeaves: vi.fn(),
}))
vi.mock('@/api/overtimes', () => ({
  getOvertimes: vi.fn().mockResolvedValue({ data: [] }),
  approveOvertime: vi.fn().mockResolvedValue({ data: {} }),
  batchApproveOvertimes: vi.fn(),
}))
vi.mock('@/api/punchCorrections', () => ({
  getCorrections: vi.fn().mockResolvedValue({ data: [] }),
  approveCorrection: vi.fn().mockResolvedValue({ data: {} }),
  batchApproveCorrections: vi.fn(),
}))
vi.mock('@/api/approvalSettings', () => ({
  getApprovalPolicies: vi.fn().mockResolvedValue({
    data: [
      { id: 1, doc_type: 'all', submitter_role: 'teacher', approver_roles: 'supervisor,hr', is_active: true },
      { id: 2, doc_type: 'leave', submitter_role: 'teacher', approver_roles: 'supervisor', is_active: true },
    ],
  }),
}))

const mockIsSuperAdmin = vi.fn().mockReturnValue(true)
vi.mock('@/utils/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/auth')>()
  return { ...actual, isSuperAdmin: () => mockIsSuperAdmin() }
})
// useApprovalModule 內部走真正的 Pinia store，測試環境無 active Pinia，需比照既有
// WorkbenchApprovalsView.test.ts 的做法直接 mock 掉（與此檔行為驗證目標無關）
vi.mock('@/stores/approvalPolicy', () => ({ useApprovalPolicyStore: () => ({ policies: [] }) }))
vi.mock('@/stores/notification', () => ({ useNotificationStore: () => ({ addNotification: vi.fn(), fetchSummary: vi.fn() }) }))

import { approveLeave } from '@/api/leaves'
import WorkbenchApprovalsView from '../WorkbenchApprovalsView.vue'

type Vm = {
  showFinalize: boolean
  chainTextFor: (submitterRole: string, docType: string) => string
  finalizeLeave: (row: Record<string, unknown>) => Promise<void>
}

const mountView = async () => {
  const w = shallowMount(WorkbenchApprovalsView)
  await flushPromises()
  return w.vm as unknown as Vm
}

describe('工作台核准整張（finalize_all）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsSuperAdmin.mockReturnValue(true)
  })

  it('非 super_admin：showFinalize false', async () => {
    mockIsSuperAdmin.mockReturnValue(false)
    const vm = await mountView()
    expect(vm.showFinalize).toBe(false)
  })

  it('鏈序解析：doc_type 專屬優先、fallback all、皆無 → fail-safe 文案', async () => {
    const vm = await mountView()
    expect(vm.chainTextFor('teacher', 'leave')).toContain('主管')
    expect(vm.chainTextFor('teacher', 'leave')).not.toContain('②')
    expect(vm.chainTextFor('teacher', 'overtime')).toContain('②')
    expect(vm.chainTextFor('hr', 'leave')).toContain('未設定審核鏈')
  })

  it('finalizeLeave：confirm 內容含鏈序與「跨過」；確認後送 finalize_all payload', async () => {
    const vm = await mountView()
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    await vm.finalizeLeave({ id: 9, submitter_role: 'teacher' })
    await flushPromises()
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('跨過'), expect.any(String), expect.any(Object))
    expect(vi.mocked(approveLeave)).toHaveBeenCalledWith(9, { approved: true, finalize_all: true })
    confirmSpy.mockRestore()
  })

  it('confirm 取消 → 不送 API', async () => {
    const vm = await mountView()
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
    await vm.finalizeLeave({ id: 9, submitter_role: 'teacher' })
    expect(vi.mocked(approveLeave)).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })
})
