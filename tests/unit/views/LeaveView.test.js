import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import LeaveView from '@/views/LeaveView.vue'
import { ElMessage, ElMessageBox } from 'element-plus'

// ── API mocks ──────────────────────────────────────────────────────────────
const getLeaves = vi.fn()
const createLeave = vi.fn()
const updateLeave = vi.fn()
const approveLeaveApi = vi.fn()
const batchApproveLeaves = vi.fn()
const getLeaveImportTemplate = vi.fn()
const importLeaves = vi.fn()

vi.mock('@/api/leaves', () => ({
  getLeaves: (...a) => getLeaves(...a),
  createLeave: (...a) => createLeave(...a),
  updateLeave: (...a) => updateLeave(...a),
  approveLeave: (...a) => approveLeaveApi(...a),
  batchApproveLeaves: (...a) => batchApproveLeaves(...a),
  getLeaveImportTemplate: (...a) => getLeaveImportTemplate(...a),
  importLeaves: (...a) => importLeaves(...a),
}))

const getApprovalLogs = vi.fn()
const getApprovalPolicies = vi.fn()
vi.mock('@/api/approvalSettings', () => ({
  getApprovalLogs: (...a) => getApprovalLogs(...a),
  getApprovalPolicies: (...a) => getApprovalPolicies(...a),
}))

// ── auth mock ──────────────────────────────────────────────────────────────
let mockUserInfo = { role: 'admin', permissions: -1 }
vi.mock('@/utils/auth', () => ({
  getUserInfo: () => mockUserInfo,
}))

// ── store mock ─────────────────────────────────────────────────────────────
const mockFetchEmployees = vi.fn()
vi.mock('@/stores/employee', () => ({
  useEmployeeStore: () => ({
    employees: [],
    fetchEmployees: mockFetchEmployees,
  }),
}))

// ── composables mock ───────────────────────────────────────────────────────
const mockOpenCreate = vi.fn()
const mockOpenEdit = vi.fn()
const mockCloseDialog = vi.fn()
const mockResetCalculatorState = vi.fn()
const mockPopulateFormFromRecord = vi.fn()

vi.mock('@/composables', () => ({
  useDateQuery: () => ({
    currentYear: 2026,
    query: { year: 2026, month: 3, employee_id: null },
  }),
  useCrudDialog: ({ resetForm, populateForm } = {}) => ({
    dialogVisible: ref(false),
    isEdit: ref(false),
    openCreate: mockOpenCreate,
    openEdit: mockOpenEdit,
    closeDialog: mockCloseDialog,
  }),
  useConfirmDelete: () => ({
    confirmDelete: vi.fn(),
  }),
  useLeaveHoursCalculator: () => ({
    QUOTA_TYPES: new Set(['annual', 'sick']),
    calcHint: ref(''),
    calcBreakdown: ref([]),
    calcLoading: ref(false),
    leaveMode: ref('full'),
    leaveSingleDate: ref(''),
    quotaInfo: ref(null),
    quotaLoading: ref(false),
    quotaExceeded: ref(false),
    canSave: ref(true),
    calcTooltipHtml: ref(''),
    officeHoursWarning: ref(''),
    resetCalculatorState: mockResetCalculatorState,
    getExpectedMaxHours: () => 8,
    populateFormFromRecord: mockPopulateFormFromRecord,
  }),
}))

// ── utils mocks ────────────────────────────────────────────────────────────
vi.mock('@/utils/download', () => ({ downloadFile: vi.fn() }))
vi.mock('@/utils/format', () => ({ money: (v) => `$${v}` }))
vi.mock('@/utils/leaves', () => ({
  LEAVE_TYPES: [
    { value: 'personal', label: '事假', deduction: '全扣', color: '' },
    { value: 'annual', label: '特休', deduction: '不扣', color: 'success' },
  ],
  LEAVE_RULE_HINTS: { annual: '年度特休依比例給予' },
}))

// ── element-plus mocks ─────────────────────────────────────────────────────
vi.mock('element-plus', () => ({
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
  ElMessageBox: {
    confirm: vi.fn(),
  },
}))

// ── global stubs ───────────────────────────────────────────────────────────
const GLOBAL_STUBS = {
  TableSkeleton: true,
  LeaveAttachmentDialog: true,
  LeaveApprovalLogDrawer: true,
  LeaveBatchRejectDialog: true,
  LeaveImportDialog: true,
  LeaveQuotaManager: true,
  LeaveRejectDialog: true,
  LeaveCalendar: true,
  'el-tabs': { template: '<div><slot /></div>' },
  'el-tab-pane': { template: '<div><slot /></div>' },
  'el-card': { template: '<div><slot /></div>' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': true,
  'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  'el-table': { template: '<div><slot /></div>' },
  'el-table-column': true,
  'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { props: ['label'], template: '<label>{{ label }}<slot /></label>' },
  'el-input': { template: '<input />' },
  'el-input-number': { props: ['modelValue'], template: '<input />' },
  'el-date-picker': { template: '<input />' },
  'el-radio-group': { template: '<div><slot /></div>' },
  'el-radio-button': { template: '<button><slot /></button>' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-icon': { template: '<span><slot /></span>' },
  'el-tooltip': { template: '<span><slot /></span>' },
  'el-alert': { props: ['title'], template: '<div>{{ title }}</div>' },
  Plus: true,
  List: true,
  Calendar: true,
  Paperclip: true,
  InfoFilled: true,
  Loading: true,
}

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

function mountLeaveView() {
  return mount(LeaveView, {
    global: {
      directives: { loading: () => {} },
      stubs: GLOBAL_STUBS,
    },
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('LeaveView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUserInfo = { role: 'admin', permissions: -1 }
    getLeaves.mockResolvedValue({ data: [] })
    getApprovalPolicies.mockResolvedValue({ data: [] })
    ElMessageBox.confirm.mockResolvedValue('confirm')
  })

  // ── 資料載入 ──────────────────────────────────────────────────────────────

  describe('fetchLeaves', () => {
    it('掛載時自動帶入年月參數呼叫 getLeaves', async () => {
      mountLeaveView()
      await flushPromises()

      expect(getLeaves).toHaveBeenCalledWith(
        expect.objectContaining({ year: 2026, month: 3 }),
      )
    })

    it('成功後將資料填入 leaveRecords', async () => {
      const records = [
        { id: 1, employee_name: '王小明', leave_type: 'personal', leave_hours: 8 },
      ]
      getLeaves.mockResolvedValue({ data: records })

      const wrapper = mountLeaveView()
      await flushPromises()

      expect(wrapper.vm.$.setupState.leaveRecords).toEqual(records)
    })

    it('API 失敗時顯示錯誤訊息', async () => {
      getLeaves.mockRejectedValue(new Error('network error'))

      mountLeaveView()
      await flushPromises()

      expect(ElMessage.error).toHaveBeenCalledWith('載入請假記錄失敗')
    })

    it('掛載時同步呼叫員工清單與審核政策', async () => {
      mountLeaveView()
      await flushPromises()

      expect(mockFetchEmployees).toHaveBeenCalled()
      expect(getApprovalPolicies).toHaveBeenCalled()
    })
  })

  // ── canApprove 邏輯 ───────────────────────────────────────────────────────

  describe('canApprove', () => {
    it('teacher 角色永遠回傳 false', async () => {
      mockUserInfo = { role: 'teacher', permissions: 0 }
      const wrapper = mountLeaveView()
      await flushPromises()

      const row = { submitter_role: 'teacher' }
      expect(wrapper.vm.$.setupState.canApprove(row)).toBe(false)
    })

    it('無 userInfo 時回傳 false', async () => {
      mockUserInfo = null
      const wrapper = mountLeaveView()
      await flushPromises()

      expect(wrapper.vm.$.setupState.canApprove({ submitter_role: 'teacher' })).toBe(false)
    })

    it('無對應 policy 時 admin 可核准', async () => {
      mockUserInfo = { role: 'admin', permissions: -1 }
      getApprovalPolicies.mockResolvedValue({ data: [] })

      const wrapper = mountLeaveView()
      await flushPromises()

      expect(wrapper.vm.$.setupState.canApprove({ submitter_role: 'teacher' })).toBe(true)
    })

    it('無對應 policy 時非 admin 不可核准', async () => {
      mockUserInfo = { role: 'supervisor', permissions: -1 }
      getApprovalPolicies.mockResolvedValue({ data: [] })

      const wrapper = mountLeaveView()
      await flushPromises()

      expect(wrapper.vm.$.setupState.canApprove({ submitter_role: 'teacher' })).toBe(false)
    })

    it('policy 中列舉的角色可以核准', async () => {
      mockUserInfo = { role: 'supervisor', permissions: -1 }
      getApprovalPolicies.mockResolvedValue({
        data: [{ submitter_role: 'teacher', approver_roles: 'supervisor, admin' }],
      })

      const wrapper = mountLeaveView()
      await flushPromises()

      expect(wrapper.vm.$.setupState.canApprove({ submitter_role: 'teacher' })).toBe(true)
    })

    it('policy 中未列舉的角色不可核准', async () => {
      mockUserInfo = { role: 'hr', permissions: -1 }
      getApprovalPolicies.mockResolvedValue({
        data: [{ submitter_role: 'teacher', approver_roles: 'supervisor' }],
      })

      const wrapper = mountLeaveView()
      await flushPromises()

      expect(wrapper.vm.$.setupState.canApprove({ submitter_role: 'teacher' })).toBe(false)
    })

    it('submitter_role 未指定時預設視為 teacher', async () => {
      mockUserInfo = { role: 'admin', permissions: -1 }
      getApprovalPolicies.mockResolvedValue({ data: [] })

      const wrapper = mountLeaveView()
      await flushPromises()

      // 無 policy，admin 可核准
      expect(wrapper.vm.$.setupState.canApprove({ })).toBe(true)
    })
  })

  // ── 審核操作 ──────────────────────────────────────────────────────────────

  describe('approveLeave', () => {
    it('呼叫 approveLeaveApi 後刷新清單', async () => {
      approveLeaveApi.mockResolvedValue({ data: {} })
      const wrapper = mountLeaveView()
      await flushPromises()
      vi.clearAllMocks()
      getLeaves.mockResolvedValue({ data: [] })

      await wrapper.vm.$.setupState.approveLeave({ id: 5, substitute_status: null })
      await flushPromises()

      expect(approveLeaveApi).toHaveBeenCalledWith(5, expect.objectContaining({ approved: true }))
      expect(getLeaves).toHaveBeenCalled()
      expect(ElMessage.success).toHaveBeenCalledWith('已核准')
    })

    it('代理人待回應時要求二次確認', async () => {
      approveLeaveApi.mockResolvedValue({ data: {} })
      const wrapper = mountLeaveView()
      await flushPromises()

      await wrapper.vm.$.setupState.approveLeave({ id: 6, substitute_status: 'pending' })
      await flushPromises()

      expect(ElMessageBox.confirm).toHaveBeenCalled()
      expect(approveLeaveApi).toHaveBeenCalledWith(
        6,
        expect.objectContaining({ force_without_substitute: true }),
      )
    })

    it('二次確認取消後不呼叫 API', async () => {
      ElMessageBox.confirm.mockRejectedValue('cancel')
      const wrapper = mountLeaveView()
      await flushPromises()
      vi.clearAllMocks()

      await wrapper.vm.$.setupState.approveLeave({ id: 6, substitute_status: 'rejected' })
      await flushPromises()

      expect(approveLeaveApi).not.toHaveBeenCalled()
    })
  })

  describe('cancelApprove', () => {
    it('以 approved:false 呼叫 API 後刷新清單', async () => {
      approveLeaveApi.mockResolvedValue({ data: {} })
      const wrapper = mountLeaveView()
      await flushPromises()
      vi.clearAllMocks()
      getLeaves.mockResolvedValue({ data: [] })

      await wrapper.vm.$.setupState.cancelApprove({ id: 7 })
      await flushPromises()

      expect(approveLeaveApi).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ approved: false }),
      )
      expect(getLeaves).toHaveBeenCalled()
    })
  })

  // ── 新增 / 編輯 ───────────────────────────────────────────────────────────

  describe('saveLeave', () => {
    async function mountAndSetForm(overrides = {}) {
      createLeave.mockResolvedValue({ data: { id: 99 } })
      updateLeave.mockResolvedValue({ data: { id: 1 } })
      const wrapper = mountLeaveView()
      await flushPromises()
      // 設定 form ref stub
      wrapper.vm.$.setupState.formRef = { validate: vi.fn().mockResolvedValue(true) }
      Object.assign(wrapper.vm.$.setupState.form, {
        id: null,
        employee_id: 1,
        leave_type: 'personal',
        start_date: '2026-03-10',
        end_date: '2026-03-10',
        leave_hours: 8,
        reason: '家事',
        ...overrides,
      })
      return wrapper
    }

    it('新增模式呼叫 createLeave 後關閉 Dialog', async () => {
      const wrapper = await mountAndSetForm()

      await wrapper.vm.$.setupState.saveLeave()
      await flushPromises()

      expect(createLeave).toHaveBeenCalledWith(
        expect.objectContaining({ employee_id: 1, leave_type: 'personal', leave_hours: 8 }),
      )
      expect(ElMessage.success).toHaveBeenCalledWith('請假記錄已新增')
    })

    it('編輯模式呼叫 updateLeave', async () => {
      const wrapper = await mountAndSetForm({ id: 1 })
      wrapper.vm.$.setupState.isEdit = true

      await wrapper.vm.$.setupState.saveLeave()
      await flushPromises()

      expect(updateLeave).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ leave_type: 'personal', leave_hours: 8 }),
      )
      expect(ElMessage.success).toHaveBeenCalledWith('請假記錄已更新')
    })

    it('表單驗證失敗時不呼叫 API', async () => {
      const wrapper = await mountAndSetForm()
      wrapper.vm.$.setupState.formRef = { validate: vi.fn().mockResolvedValue(false) }

      await wrapper.vm.$.setupState.saveLeave()

      expect(createLeave).not.toHaveBeenCalled()
    })

    it('API 失敗時顯示錯誤訊息', async () => {
      const wrapper = await mountAndSetForm()
      createLeave.mockRejectedValue({ response: { data: { detail: '系統錯誤' } } })

      await wrapper.vm.$.setupState.saveLeave()
      await flushPromises()

      expect(ElMessage.error).toHaveBeenCalledWith(expect.stringContaining('系統錯誤'))
    })
  })

  // ── 批次操作 ──────────────────────────────────────────────────────────────

  describe('批次核准', () => {
    it('確認後呼叫 batchApproveLeaves(ids, true)', async () => {
      batchApproveLeaves.mockResolvedValue({ data: { succeeded: [{ id: 1 }, { id: 2 }], failed: [] } })
      const wrapper = mountLeaveView()
      await flushPromises()
      getLeaves.mockResolvedValue({ data: [] })

      wrapper.vm.$.setupState.selectedLeaves = [{ id: 1 }, { id: 2 }]
      await wrapper.vm.$.setupState.showBatchApproveConfirm()
      await flushPromises()

      expect(batchApproveLeaves).toHaveBeenCalledWith([1, 2], true)
      expect(ElMessage.success).toHaveBeenCalledWith(expect.stringContaining('2'))
    })

    it('用戶取消確認時不呼叫 API', async () => {
      ElMessageBox.confirm.mockRejectedValue('cancel')
      const wrapper = mountLeaveView()
      await flushPromises()

      wrapper.vm.$.setupState.selectedLeaves = [{ id: 1 }]
      await wrapper.vm.$.setupState.showBatchApproveConfirm()
      await flushPromises()

      expect(batchApproveLeaves).not.toHaveBeenCalled()
    })
  })

  describe('批次駁回', () => {
    it('駁回原因為空時顯示警告', async () => {
      const wrapper = mountLeaveView()
      await flushPromises()

      wrapper.vm.$.setupState.batchRejectReason = '   '
      await wrapper.vm.$.setupState.confirmBatchReject()

      expect(ElMessage.warning).toHaveBeenCalledWith('請填寫駁回原因')
      expect(batchApproveLeaves).not.toHaveBeenCalled()
    })

    it('有原因時呼叫 batchApproveLeaves(ids, false, reason)', async () => {
      batchApproveLeaves.mockResolvedValue({ data: { succeeded: [{ id: 3 }], failed: [] } })
      const wrapper = mountLeaveView()
      await flushPromises()
      getLeaves.mockResolvedValue({ data: [] })

      wrapper.vm.$.setupState.selectedLeaves = [{ id: 3 }]
      wrapper.vm.$.setupState.batchRejectReason = '事由不足'
      await wrapper.vm.$.setupState.confirmBatchReject()
      await flushPromises()

      expect(batchApproveLeaves).toHaveBeenCalledWith([3], false, '事由不足')
    })
  })
})
