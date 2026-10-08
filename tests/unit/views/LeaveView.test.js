import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import LeaveView from '@/views/LeaveView.vue'
import { ElMessage, ElMessageBox } from 'element-plus'

// 分頁契約 mock helper：抄 src/api/_pagination.ts 的 PagedResult 形狀。
// 三支列表 api 自 2026-08-11 起回 PagedResult 而非 AxiosResponse，mock 若還用
// { data } 會靜默給出空清單（假綠），故一律經此 helper 建構。
const paged = (items) => ({
  items,
  total: Array.isArray(items) ? items.length : 0,
  page: 1,
  pageSize: 5000,
  hasMore: false,
})


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
  hasPermission: () => true,
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

vi.mock('@/composables', async () => ({
  // 客端過濾走真實實作：搜尋收斂行為是本元件的受測邏輯之一
  useClientTableFilter: (await vi.importActual('@/composables/useClientTableFilter')).useClientTableFilter,
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
    effectiveRemaining: ref(null),
    canSave: ref(true),
    calcTooltipHtml: ref(''),
    officeHoursWarning: ref(''),
    resetCalculatorState: mockResetCalculatorState,
    getExpectedMaxHours: () => 8,
    populateFormFromRecord: mockPopulateFormFromRecord,
  }),
  useApprovalOperation: ({ apiFn, onSuccess, errorMsg = '操作失敗' }) => {
    const execute = async (id, payload, successMsg) => {
      try {
        await apiFn(id, payload)
        ElMessage.success(successMsg)
        onSuccess()
      } catch {
        ElMessage.error(errorMsg)
      }
    }
    return { execute, isLoading: ref(false) }
  },
}))

// ── utils mocks ────────────────────────────────────────────────────────────
vi.mock('@/utils/download', () => ({ downloadFile: vi.fn() }))
vi.mock('@/utils/format', () => ({ money: (v) => `$${v}` }))
// 2026-09-15 起 LeaveView 用它算「缺附件」需注意訊號；獨立宣告成可在各測試案例覆寫的
// mock（預設 false），日曆天數門檻本身的行為由 utils/leaves.ts 自己的測試覆蓋
const leaveRequiresAttachmentMock = vi.fn(() => false)
vi.mock('@/utils/leaves', () => ({
  LEAVE_TYPES: [
    { value: 'personal', label: '事假', deduction: '全扣', color: '' },
    { value: 'annual', label: '特休', deduction: '不扣', color: 'success' },
  ],
  LEAVE_RULE_HINTS: { annual: '年度特休依比例給予' },
  validateLeaveRules: vi.fn(() => []),
  leaveRequiresAttachment: (...a) => leaveRequiresAttachmentMock(...a),
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
  AdminListToolbar: true,
  LeaveAttachmentDialog: true,
  LeaveBatchRejectDialog: true,
  LeaveImportDialog: true,
  LeaveQuotaManager: true,
  LeaveQuotaOverviewTable: true,
  LeaveReviewDrawer: true,
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
  ArrowLeft: true,
  ArrowRight: true,
  Wallet: true,
  PageHeader: true,
  'el-divider': true,
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
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockUserInfo = { role: 'admin', permissions: -1 }
    getLeaves.mockResolvedValue(paged([]))
    getApprovalPolicies.mockResolvedValue({ data: [] })
    ElMessageBox.confirm.mockResolvedValue('confirm')
    leaveRequiresAttachmentMock.mockReturnValue(false)
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
      getLeaves.mockResolvedValue(paged(records))

      const wrapper = mountLeaveView()
      await flushPromises()

      expect(wrapper.vm.$.setupState.leaveRecords).toEqual(records)
    })

    it('API 失敗時顯示錯誤訊息', async () => {
      getLeaves.mockRejectedValue(new Error('network error'))

      mountLeaveView()
      await flushPromises()

      expect(ElMessage.error).toHaveBeenCalledWith(expect.stringContaining('載入請假記錄失敗'))
    })

    it('掛載時同步呼叫員工清單與審核政策', async () => {
      mountLeaveView()
      await flushPromises()

      expect(mockFetchEmployees).toHaveBeenCalled()
      expect(getApprovalPolicies).toHaveBeenCalled()
    })
  })

  // ── 關鍵字搜尋（客端過濾）─────────────────────────────────────────────────

  describe('關鍵字搜尋', () => {
    const records = [
      { id: 1, employee_name: '王小明', reason: '家事', leave_type: 'personal' },
      { id: 2, employee_name: '李大華', reason: '回診複查', leave_type: 'annual' },
    ]

    it('依員工姓名收斂 filteredLeaves', async () => {
      getLeaves.mockResolvedValue(paged(records))
      const wrapper = mountLeaveView()
      await flushPromises()

      wrapper.vm.$.setupState.leaveSearch = '王小'
      expect(wrapper.vm.$.setupState.filteredLeaves).toEqual([records[0]])
      expect(wrapper.vm.$.setupState.leaveShown).toBe(1)
      expect(wrapper.vm.$.setupState.leaveTotal).toBe(2)
    })

    it('依請假原因也可命中', async () => {
      getLeaves.mockResolvedValue(paged(records))
      const wrapper = mountLeaveView()
      await flushPromises()

      wrapper.vm.$.setupState.leaveSearch = '回診'
      expect(wrapper.vm.$.setupState.filteredLeaves).toEqual([records[1]])
    })

    it('清空搜尋字串時還原全部資料', async () => {
      getLeaves.mockResolvedValue(paged(records))
      const wrapper = mountLeaveView()
      await flushPromises()

      wrapper.vm.$.setupState.leaveSearch = '王小'
      wrapper.vm.$.setupState.leaveSearch = ''
      expect(wrapper.vm.$.setupState.filteredLeaves).toEqual(records)
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
      getLeaves.mockResolvedValue(paged([]))

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
      getLeaves.mockResolvedValue(paged([]))

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

    // 迴歸：編輯既有假單時，本筆時數已計入 used_hours → remaining_hours 已扣掉本筆。
    // 配額確認閘門必須用「實際可用（remaining + editBaseline）」，與 quotaExceeded 警示一致，
    // 否則會跳出不該出現的「配額不足」確認框。
    it('編輯模式：本次時數 ≤ 實際可用配額（含 editBaseline）時不觸發配額不足確認', async () => {
      const wrapper = await mountAndSetForm({ id: 1, leave_type: 'annual', leave_hours: 8 })
      wrapper.vm.$.setupState.isEdit = true
      // remaining_hours 已扣掉本筆 8h → 0；但實際可用 = 0 + 8(editBaseline) = 8
      wrapper.vm.$.setupState.quotaInfo = { remaining_hours: 0 }
      wrapper.vm.$.setupState.effectiveRemaining = 8

      await wrapper.vm.$.setupState.saveLeave()
      await flushPromises()

      // 8h ≤ 實際可用 8h → 不應跳出任何確認框
      expect(ElMessageBox.confirm).not.toHaveBeenCalled()
      expect(updateLeave).toHaveBeenCalled()
    })

    it('編輯模式：本次時數超過實際可用配額時仍觸發配額不足確認', async () => {
      const wrapper = await mountAndSetForm({ id: 1, leave_type: 'annual', leave_hours: 8 })
      wrapper.vm.$.setupState.isEdit = true
      // 實際可用 = 1 + 2 = 3 < 8 → 應觸發確認
      wrapper.vm.$.setupState.quotaInfo = { remaining_hours: 1 }
      wrapper.vm.$.setupState.effectiveRemaining = 3

      await wrapper.vm.$.setupState.saveLeave()
      await flushPromises()

      expect(ElMessageBox.confirm).toHaveBeenCalledWith(
        expect.stringContaining('超出剩餘配額'),
        expect.anything(),
        expect.anything(),
      )
    })
  })

  // ── 批次操作 ──────────────────────────────────────────────────────────────

  describe('批次核准', () => {
    it('確認後呼叫 batchApproveLeaves(ids, true)', async () => {
      batchApproveLeaves.mockResolvedValue({ data: { succeeded: [{ id: 1 }, { id: 2 }], failed: [] } })
      const wrapper = mountLeaveView()
      await flushPromises()
      getLeaves.mockResolvedValue(paged([]))

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
      getLeaves.mockResolvedValue(paged([]))

      wrapper.vm.$.setupState.selectedLeaves = [{ id: 3 }]
      wrapper.vm.$.setupState.batchRejectReason = '事由不足'
      await wrapper.vm.$.setupState.confirmBatchReject()
      await flushPromises()

      expect(batchApproveLeaves).toHaveBeenCalledWith([3], false, '事由不足')
    })
  })

  // ── 2026-09-15 UI/UX 改版：需注意訊號、篩選計數、待審排序 ──────────────────

  describe('leaveNeedsAttachment / leaveSubstituteAttention / leaveHasSwap', () => {
    it('待審且超過附件門檻、無附件 → 缺附件為 true', async () => {
      leaveRequiresAttachmentMock.mockReturnValue(true)
      const wrapper = mountLeaveView()
      await flushPromises()

      const row = { status: 'pending', start_date: '2026-03-01', end_date: '2026-03-10', attachment_paths: [] }
      expect(wrapper.vm.$.setupState.leaveNeedsAttachment(row)).toBe(true)
    })

    it('已有附件 → 缺附件為 false（即使超過門檻）', async () => {
      leaveRequiresAttachmentMock.mockReturnValue(true)
      const wrapper = mountLeaveView()
      await flushPromises()

      const row = { status: 'pending', start_date: '2026-03-01', end_date: '2026-03-10', attachment_paths: ['a.jpg'] }
      expect(wrapper.vm.$.setupState.leaveNeedsAttachment(row)).toBe(false)
    })

    it('已核准的假單不再提示缺附件（狀態不是 pending）', async () => {
      leaveRequiresAttachmentMock.mockReturnValue(true)
      const wrapper = mountLeaveView()
      await flushPromises()

      const row = { status: 'approved', start_date: '2026-03-01', end_date: '2026-03-10', attachment_paths: [] }
      expect(wrapper.vm.$.setupState.leaveNeedsAttachment(row)).toBe(false)
    })

    it('代理人待回應或已拒絕且假單待審 → 代理人未確認為 true', async () => {
      const wrapper = mountLeaveView()
      await flushPromises()

      expect(wrapper.vm.$.setupState.leaveSubstituteAttention({ status: 'pending', substitute_status: 'pending' })).toBe(true)
      expect(wrapper.vm.$.setupState.leaveSubstituteAttention({ status: 'pending', substitute_status: 'rejected' })).toBe(true)
      expect(wrapper.vm.$.setupState.leaveSubstituteAttention({ status: 'pending', substitute_status: 'accepted' })).toBe(false)
      expect(wrapper.vm.$.setupState.leaveSubstituteAttention({ status: 'approved', substitute_status: 'pending' })).toBe(false)
    })

    it('綁定換班申請 → leaveHasSwap 為 true', async () => {
      const wrapper = mountLeaveView()
      await flushPromises()

      expect(wrapper.vm.$.setupState.leaveHasSwap({ related_swap: { id: 1 } })).toBe(true)
      expect(wrapper.vm.$.setupState.leaveHasSwap({ related_swap: null })).toBe(false)
    })
  })

  describe('leaveFilterGroups 計數', () => {
    it('依 leaveRecords 算出狀態與需注意兩組計數', async () => {
      leaveRequiresAttachmentMock.mockReturnValue(true)
      getLeaves.mockResolvedValue(paged([
        { id: 1, status: 'pending', start_date: '2026-03-01', end_date: '2026-03-10', attachment_paths: [], substitute_status: 'pending' },
        { id: 2, status: 'pending', start_date: '2026-03-02', end_date: '2026-03-02', attachment_paths: ['a.jpg'], substitute_status: 'not_required' },
        { id: 3, status: 'approved', start_date: '2026-03-03', end_date: '2026-03-03', attachment_paths: [], substitute_status: 'not_required' },
        { id: 4, status: 'rejected', start_date: '2026-03-04', end_date: '2026-03-04', attachment_paths: [], substitute_status: 'not_required' },
      ]))
      const wrapper = mountLeaveView()
      await flushPromises()

      const groups = wrapper.vm.$.setupState.leaveFilterGroups
      const statusGroup = groups.find((g) => g.key === 'status')
      const signalGroup = groups.find((g) => g.key === 'signal')
      expect(statusGroup.options.find((o) => o.value === 'pending').label).toContain('2')
      expect(statusGroup.options.find((o) => o.value === 'approved').label).toContain('1')
      expect(statusGroup.options.find((o) => o.value === 'rejected').label).toContain('1')
      // 只有 id:1 同時待審＋超門檻＋無附件，缺附件計數應為 1（id:2 有附件、id:3/4 非待審）
      expect(signalGroup.options.find((o) => o.value === 'missing_attachment').label).toContain('1')
      expect(signalGroup.options.find((o) => o.value === 'substitute_attention').label).toContain('1')
    })
  })

  describe('displayLeaves 待審排序', () => {
    it('待審記錄排在非待審記錄之前，各組內維持原順序', async () => {
      getLeaves.mockResolvedValue(paged([
        { id: 1, status: 'approved', employee_name: 'A' },
        { id: 2, status: 'pending', employee_name: 'B' },
        { id: 3, status: 'rejected', employee_name: 'C' },
        { id: 4, status: 'pending', employee_name: 'D' },
      ]))
      const wrapper = mountLeaveView()
      await flushPromises()

      expect(wrapper.vm.$.setupState.displayLeaves.map((r) => r.id)).toEqual([2, 4, 1, 3])
    })
  })

  describe('審核抽屜（畫面 B）：查看詳情、同期間人力計算', () => {
    it('handleRowCommand("review", row) 開啟抽屜並記住該筆', async () => {
      const wrapper = mountLeaveView()
      await flushPromises()

      const row = { id: 9, employee_name: '王小明' }
      wrapper.vm.$.setupState.handleRowCommand('review', row)

      expect(wrapper.vm.$.setupState.reviewVisible).toBe(true)
      expect(wrapper.vm.$.setupState.reviewRow).toEqual(row)
    })

    it('reviewSameDayCount：只算與本筆日期重疊、非本筆、待審或已核准的其他假單', async () => {
      getLeaves.mockResolvedValue(paged([
        { id: 1, status: 'pending', start_date: '2026-03-10', end_date: '2026-03-15' },
        { id: 2, status: 'approved', start_date: '2026-03-01', end_date: '2026-03-11' }, // 重疊
        { id: 3, status: 'rejected', start_date: '2026-03-10', end_date: '2026-03-12' }, // 已駁回不計
        { id: 4, status: 'pending', start_date: '2026-03-20', end_date: '2026-03-25' }, // 不重疊
      ]))
      const wrapper = mountLeaveView()
      await flushPromises()

      wrapper.vm.$.setupState.reviewRow = { id: 1, start_date: '2026-03-10', end_date: '2026-03-15' }
      expect(wrapper.vm.$.setupState.reviewSameDayCount).toBe(1)
    })

    it('reviewRow 為 null 時 reviewSameDayCount 為 0', async () => {
      const wrapper = mountLeaveView()
      await flushPromises()
      expect(wrapper.vm.$.setupState.reviewSameDayCount).toBe(0)
    })
  })

  describe('新增假單彈窗（畫面 C）：日期區間 model 與配額進度列', () => {
    it('fullRangeModel getter：兩個日期都有值才回傳 tuple，否則 null', async () => {
      const wrapper = mountLeaveView()
      await flushPromises()

      expect(wrapper.vm.$.setupState.fullRangeModel).toBeNull()
      wrapper.vm.$.setupState.form.start_date = '2026-03-01'
      wrapper.vm.$.setupState.form.end_date = '2026-03-05'
      expect(wrapper.vm.$.setupState.fullRangeModel).toEqual(['2026-03-01', '2026-03-05'])
    })

    it('fullRangeModel setter：寫回 form.start_date / form.end_date；清空時回空字串', async () => {
      const wrapper = mountLeaveView()
      await flushPromises()

      wrapper.vm.$.setupState.fullRangeModel = ['2026-04-01', '2026-04-03']
      expect(wrapper.vm.$.setupState.form.start_date).toBe('2026-04-01')
      expect(wrapper.vm.$.setupState.form.end_date).toBe('2026-04-03')

      wrapper.vm.$.setupState.fullRangeModel = null
      expect(wrapper.vm.$.setupState.form.start_date).toBe('')
      expect(wrapper.vm.$.setupState.form.end_date).toBe('')
    })

    it('quotaUsedPct / quotaPendingPct 依 total_hours 算百分比，無配額時為 0', async () => {
      const wrapper = mountLeaveView()
      await flushPromises()

      expect(wrapper.vm.$.setupState.quotaUsedPct).toBe(0)
      expect(wrapper.vm.$.setupState.quotaPendingPct).toBe(0)

      wrapper.vm.$.setupState.quotaInfo = { used_hours: 24, pending_hours: 40, remaining_hours: 16, total_hours: 80 }
      expect(wrapper.vm.$.setupState.quotaUsedPct).toBe(30)
      expect(wrapper.vm.$.setupState.quotaPendingPct).toBe(50)
    })
  })
})
