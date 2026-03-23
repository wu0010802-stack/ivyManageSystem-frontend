import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import OvertimeView from '@/views/OvertimeView.vue'
import { ElMessage, ElMessageBox } from 'element-plus'

// ── API mocks ──────────────────────────────────────────────────────────────
const getOvertimes = vi.fn()
const createOvertime = vi.fn()
const updateOvertime = vi.fn()
const approveOvertimeApi = vi.fn()
const batchApproveOvertimes = vi.fn()
const getOvertimeImportTemplate = vi.fn()
const importOvertimes = vi.fn()

vi.mock('@/api/overtimes', () => ({
  getOvertimes: (...a) => getOvertimes(...a),
  createOvertime: (...a) => createOvertime(...a),
  updateOvertime: (...a) => updateOvertime(...a),
  approveOvertime: (...a) => approveOvertimeApi(...a),
  batchApproveOvertimes: (...a) => batchApproveOvertimes(...a),
  getOvertimeImportTemplate: (...a) => getOvertimeImportTemplate(...a),
  importOvertimes: (...a) => importOvertimes(...a),
}))

const getApprovalLogs = vi.fn()
const getApprovalPolicies = vi.fn()
vi.mock('@/api/approvalSettings', () => ({
  getApprovalLogs: (...a) => getApprovalLogs(...a),
  getApprovalPolicies: (...a) => getApprovalPolicies(...a),
}))

// ── auth mock ──────────────────────────────────────────────────────────────
// 預設：admin 全權限，canViewOvertime / canViewMeetings 皆 true
let mockHasPermission = vi.fn(() => true)
let mockUserInfo = { role: 'admin', permissions: -1 }

vi.mock('@/utils/auth', () => ({
  getUserInfo: () => mockUserInfo,
  hasPermission: (...a) => mockHasPermission(...a),
}))

// ── store mock ─────────────────────────────────────────────────────────────
const mockFetchEmployees = vi.fn()
vi.mock('@/stores/employee', () => ({
  useEmployeeStore: () => ({
    employees: [{ id: 1, name: '王小明' }],
    fetchEmployees: mockFetchEmployees,
  }),
}))

// ── composables mock ───────────────────────────────────────────────────────
vi.mock('@/composables', () => ({
  useDateQuery: () => ({
    currentYear: 2026,
    query: { year: 2026, month: 3, employee_id: null },
  }),
  useCrudDialog: () => ({
    dialogVisible: ref(false),
    isEdit: ref(false),
    openCreate: vi.fn(),
    openEdit: vi.fn(),
    closeDialog: vi.fn(),
  }),
  useConfirmDelete: () => ({
    confirmDelete: vi.fn(),
  }),
}))

// ── router mock ────────────────────────────────────────────────────────────
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: vi.fn() }),
}))

// ── utils mocks ────────────────────────────────────────────────────────────
vi.mock('@/utils/download', () => ({ downloadFile: vi.fn() }))
vi.mock('@/utils/format', () => ({ money: (v) => `$${v}` }))

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
  MeetingManagementPanel: true,
  'el-tabs': { template: '<div><slot /></div>' },
  'el-tab-pane': { template: '<div><slot /></div>' },
  'el-card': { template: '<div><slot /></div>' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': true,
  'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  'el-table': { template: '<div><slot /></div>' },
  'el-table-column': true,
  'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-drawer': { template: '<div><slot /></div>' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { props: ['label'], template: '<label>{{ label }}<slot /></label>' },
  'el-input': { template: '<input />' },
  'el-input-number': { props: ['modelValue'], template: '<input />' },
  'el-date-picker': { template: '<input />' },
  'el-time-picker': { template: '<input />' },
  'el-switch': { template: '<input type="checkbox" />' },
  'el-upload': { template: '<div><slot /><slot name="tip" /></div>' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-icon': { template: '<span><slot /></span>' },
  'el-tooltip': { template: '<span><slot /></span>' },
  'el-alert': { props: ['title'], template: '<div><slot name="title">{{ title }}</slot></div>' },
  'el-timeline': { template: '<div><slot /></div>' },
  'el-timeline-item': { template: '<div><slot /></div>' },
  'el-empty': { template: '<div />' },
  Plus: true,
  Check: true,
  Close: true,
  Loading: true,
  UploadFilled: true,
}

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

function mountOvertimeView() {
  return mount(OvertimeView, {
    global: {
      directives: { loading: () => {} },
      stubs: GLOBAL_STUBS,
    },
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('OvertimeView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHasPermission = vi.fn(() => true)
    mockUserInfo = { role: 'admin', permissions: -1 }
    getOvertimes.mockResolvedValue({ data: [] })
    getApprovalPolicies.mockResolvedValue({ data: [] })
    ElMessageBox.confirm.mockResolvedValue('confirm')
  })

  // ── 資料載入 ──────────────────────────────────────────────────────────────

  describe('fetchOvertimes', () => {
    it('掛載時帶入年月參數呼叫 getOvertimes', async () => {
      mountOvertimeView()
      await flushPromises()

      expect(getOvertimes).toHaveBeenCalledWith(
        expect.objectContaining({ year: 2026, month: 3 }),
      )
    })

    it('成功後更新 overtimeRecords', async () => {
      const records = [{ id: 1, employee_name: '王小明', hours: 3, overtime_pay: 600 }]
      getOvertimes.mockResolvedValue({ data: records })

      const wrapper = mountOvertimeView()
      await flushPromises()

      expect(wrapper.vm.$.setupState.overtimeRecords).toEqual(records)
    })

    it('API 失敗時顯示錯誤訊息', async () => {
      getOvertimes.mockRejectedValue(new Error('timeout'))

      mountOvertimeView()
      await flushPromises()

      expect(ElMessage.error).toHaveBeenCalledWith('載入加班記錄失敗')
    })

    it('canViewOvertime 為 false 時不發 API 請求', async () => {
      // OVERTIME_READ 無權限
      mockHasPermission = vi.fn((perm) => perm !== 'OVERTIME_READ')

      mountOvertimeView()
      await flushPromises()

      // getOvertimes 不應被呼叫（pending 與正常查詢都跳過）
      expect(getOvertimes).not.toHaveBeenCalled()
    })
  })

  // ── computed 統計 ─────────────────────────────────────────────────────────

  describe('totalHours & totalPay', () => {
    it('正確加總所有加班時數', async () => {
      getOvertimes.mockResolvedValue({
        data: [
          { id: 1, hours: 2, overtime_pay: 400 },
          { id: 2, hours: 3, overtime_pay: 600 },
        ],
      })
      const wrapper = mountOvertimeView()
      await flushPromises()

      expect(wrapper.vm.$.setupState.overtimeSummary.totalHours).toBe(5)
    })

    it('正確加總所有加班費', async () => {
      getOvertimes.mockResolvedValue({
        data: [
          { id: 1, hours: 2, overtime_pay: 400 },
          { id: 2, hours: 3, overtime_pay: 600 },
        ],
      })
      const wrapper = mountOvertimeView()
      await flushPromises()

      expect(wrapper.vm.$.setupState.overtimeSummary.totalPay).toBe(1000)
    })

    it('overtime_pay 為 null/undefined 時不影響計算', async () => {
      getOvertimes.mockResolvedValue({
        data: [
          { id: 1, hours: 2, overtime_pay: null },
          { id: 2, hours: 1, overtime_pay: undefined },
        ],
      })
      const wrapper = mountOvertimeView()
      await flushPromises()

      expect(wrapper.vm.$.setupState.overtimeSummary.totalPay).toBe(0)
      expect(wrapper.vm.$.setupState.overtimeSummary.totalHours).toBe(3)
    })
  })

  // ── canApprove 邏輯 ───────────────────────────────────────────────────────

  describe('canApprove', () => {
    it('teacher 角色永遠回傳 false', async () => {
      mockUserInfo = { role: 'teacher', permissions: 0 }
      const wrapper = mountOvertimeView()
      await flushPromises()

      expect(wrapper.vm.$.setupState.canApprove({ submitter_role: 'teacher' })).toBe(false)
    })

    it('無 userInfo 時回傳 false', async () => {
      mockUserInfo = null
      const wrapper = mountOvertimeView()
      await flushPromises()

      expect(wrapper.vm.$.setupState.canApprove({ submitter_role: 'teacher' })).toBe(false)
    })

    it('無 policy 時 admin 可核准', async () => {
      mockUserInfo = { role: 'admin', permissions: -1 }
      getApprovalPolicies.mockResolvedValue({ data: [] })

      const wrapper = mountOvertimeView()
      await flushPromises()

      expect(wrapper.vm.$.setupState.canApprove({ submitter_role: 'teacher' })).toBe(true)
    })

    it('policy 中列舉的角色可以核准', async () => {
      mockUserInfo = { role: 'supervisor', permissions: -1 }
      getApprovalPolicies.mockResolvedValue({
        data: [{ submitter_role: 'teacher', approver_roles: 'supervisor, admin' }],
      })

      const wrapper = mountOvertimeView()
      await flushPromises()

      expect(wrapper.vm.$.setupState.canApprove({ submitter_role: 'teacher' })).toBe(true)
    })

    it('policy 中未列舉的角色不可核准', async () => {
      mockUserInfo = { role: 'staff', permissions: -1 }
      getApprovalPolicies.mockResolvedValue({
        data: [{ submitter_role: 'teacher', approver_roles: 'supervisor' }],
      })

      const wrapper = mountOvertimeView()
      await flushPromises()

      expect(wrapper.vm.$.setupState.canApprove({ submitter_role: 'teacher' })).toBe(false)
    })
  })

  // ── 審核操作 ──────────────────────────────────────────────────────────────

  describe('approveOvertime', () => {
    it('approved=true 時呼叫 API 並顯示成功訊息', async () => {
      approveOvertimeApi.mockResolvedValue({})
      const wrapper = mountOvertimeView()
      await flushPromises()
      vi.clearAllMocks()
      getOvertimes.mockResolvedValue({ data: [] })

      await wrapper.vm.$.setupState.approveOvertime({ id: 10 }, true)
      await flushPromises()

      expect(approveOvertimeApi).toHaveBeenCalledWith(10, true)
      expect(ElMessage.success).toHaveBeenCalledWith('已核准')
      expect(getOvertimes).toHaveBeenCalled()
    })

    it('approved=false 時顯示已駁回', async () => {
      approveOvertimeApi.mockResolvedValue({})
      const wrapper = mountOvertimeView()
      await flushPromises()
      vi.clearAllMocks()
      getOvertimes.mockResolvedValue({ data: [] })

      await wrapper.vm.$.setupState.approveOvertime({ id: 11 }, false)
      await flushPromises()

      expect(ElMessage.success).toHaveBeenCalledWith('已駁回')
    })
  })

  // ── 新增 / 編輯 ───────────────────────────────────────────────────────────

  describe('saveOvertime', () => {
    it('必填欄位缺失時顯示警告', async () => {
      const wrapper = mountOvertimeView()
      await flushPromises()

      // employee_id 為空
      wrapper.vm.$.setupState.form.employee_id = null
      wrapper.vm.$.setupState.form.overtime_date = ''
      await wrapper.vm.$.setupState.saveOvertime()

      expect(ElMessage.warning).toHaveBeenCalledWith('請填寫必要欄位')
      expect(createOvertime).not.toHaveBeenCalled()
    })

    it('新增模式呼叫 createOvertime 並顯示加班費', async () => {
      createOvertime.mockResolvedValue({ data: { id: 20, overtime_pay: 800 } })
      const wrapper = mountOvertimeView()
      await flushPromises()
      vi.clearAllMocks()
      getOvertimes.mockResolvedValue({ data: [] })

      Object.assign(wrapper.vm.$.setupState.form, {
        id: null,
        employee_id: 1,
        overtime_date: '2026-03-15',
        overtime_type: 'weekday',
        start_time: '18:00',
        end_time: '20:00',
        hours: 2,
        reason: '專案趕工',
        use_comp_leave: false,
      })
      wrapper.vm.$.setupState.isEdit = false

      await wrapper.vm.$.setupState.saveOvertime()
      await flushPromises()

      expect(createOvertime).toHaveBeenCalledWith(
        expect.objectContaining({ employee_id: 1, hours: 2 }),
      )
      expect(ElMessage.success).toHaveBeenCalledWith(expect.stringContaining('800'))
    })

    it('編輯模式不傳入 employee_id', async () => {
      updateOvertime.mockResolvedValue({ data: { id: 5, overtime_pay: 400 } })
      const wrapper = mountOvertimeView()
      await flushPromises()
      vi.clearAllMocks()
      getOvertimes.mockResolvedValue({ data: [] })

      Object.assign(wrapper.vm.$.setupState.form, {
        id: 5,
        employee_id: 1,
        overtime_date: '2026-03-15',
        overtime_type: 'weekday',
        hours: 1,
        reason: '',
      })
      wrapper.vm.$.setupState.isEdit = true

      await wrapper.vm.$.setupState.saveOvertime()
      await flushPromises()

      expect(updateOvertime).toHaveBeenCalledWith(5, expect.not.objectContaining({ employee_id: 1 }))
    })

    it('API 失敗時顯示錯誤訊息', async () => {
      createOvertime.mockRejectedValue({ response: { data: { detail: 'DB 錯誤' } } })
      const wrapper = mountOvertimeView()
      await flushPromises()

      Object.assign(wrapper.vm.$.setupState.form, {
        employee_id: 1,
        overtime_date: '2026-03-15',
      })

      await wrapper.vm.$.setupState.saveOvertime()
      await flushPromises()

      expect(ElMessage.error).toHaveBeenCalledWith(expect.stringContaining('DB 錯誤'))
    })
  })

  // ── 批次操作 ──────────────────────────────────────────────────────────────

  describe('批次核准', () => {
    it('確認後呼叫 batchApproveOvertimes(ids, true)', async () => {
      batchApproveOvertimes.mockResolvedValue({
        data: { succeeded: [{ id: 1 }, { id: 2 }], failed: [] },
      })
      const wrapper = mountOvertimeView()
      await flushPromises()
      vi.clearAllMocks()
      getOvertimes.mockResolvedValue({ data: [] })

      wrapper.vm.$.setupState.selectedOvertimes = [{ id: 1 }, { id: 2 }]
      await wrapper.vm.$.setupState.showBatchApproveConfirm()
      await flushPromises()

      expect(batchApproveOvertimes).toHaveBeenCalledWith([1, 2], true)
      expect(ElMessage.success).toHaveBeenCalledWith(expect.stringContaining('2'))
    })

    it('用戶取消時不呼叫 API', async () => {
      ElMessageBox.confirm.mockRejectedValue('cancel')
      const wrapper = mountOvertimeView()
      await flushPromises()

      wrapper.vm.$.setupState.selectedOvertimes = [{ id: 1 }]
      await wrapper.vm.$.setupState.showBatchApproveConfirm()
      await flushPromises()

      expect(batchApproveOvertimes).not.toHaveBeenCalled()
    })
  })

  describe('批次駁回', () => {
    it('原因為空時顯示警告', async () => {
      const wrapper = mountOvertimeView()
      await flushPromises()

      wrapper.vm.$.setupState.batchRejectReason = ''
      await wrapper.vm.$.setupState.confirmBatchReject()

      expect(ElMessage.warning).toHaveBeenCalledWith('請填寫駁回原因')
      expect(batchApproveOvertimes).not.toHaveBeenCalled()
    })

    it('有原因時呼叫 batchApproveOvertimes(ids, false, reason)', async () => {
      batchApproveOvertimes.mockResolvedValue({
        data: { succeeded: [{ id: 3 }], failed: [] },
      })
      const wrapper = mountOvertimeView()
      await flushPromises()
      vi.clearAllMocks()
      getOvertimes.mockResolvedValue({ data: [] })

      wrapper.vm.$.setupState.selectedOvertimes = [{ id: 3 }]
      wrapper.vm.$.setupState.batchRejectReason = '理由不充分'
      await wrapper.vm.$.setupState.confirmBatchReject()
      await flushPromises()

      expect(batchApproveOvertimes).toHaveBeenCalledWith([3], false, '理由不充分')
    })
  })
})
