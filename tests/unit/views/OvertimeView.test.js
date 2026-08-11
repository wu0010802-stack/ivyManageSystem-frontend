import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import OvertimeView from '@/views/OvertimeView.vue'
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
vi.mock('@/composables', async () => ({
  // 客端過濾走真實實作：搜尋收斂行為是本元件的受測邏輯之一
  useClientTableFilter: (await vi.importActual('@/composables/useClientTableFilter')).useClientTableFilter,
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
  useFetchPending: (apiFn) => {
    const items = ref([])
    const fetch = vi.fn(async () => {
      try {
        const res = await apiFn({ status: 'pending' })
        items.value = Array.isArray(res.data) ? res.data : []
      } catch { /* silent */ }
    })
    return { items, fetch, isLoading: ref(false) }
  },
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
    prompt: vi.fn(),
  },
}))

// ── global stubs ───────────────────────────────────────────────────────────
const GLOBAL_STUBS = {
  TableSkeleton: true,
  AdminListToolbar: true,
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
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockHasPermission = vi.fn(() => true)
    mockUserInfo = { role: 'admin', permissions: -1 }
    getOvertimes.mockResolvedValue(paged([]))
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
      getOvertimes.mockResolvedValue(paged(records))

      const wrapper = mountOvertimeView()
      await flushPromises()

      expect(wrapper.vm.$.setupState.overtimeRecords).toEqual(records)
    })

    it('API 失敗時顯示錯誤訊息', async () => {
      getOvertimes.mockRejectedValue(new Error('timeout'))

      mountOvertimeView()
      await flushPromises()

      expect(ElMessage.error).toHaveBeenCalledWith(expect.stringContaining('載入加班記錄失敗'))
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

  // ── 關鍵字搜尋（客端過濾）─────────────────────────────────────────────────

  describe('關鍵字搜尋', () => {
    const records = [
      { id: 1, employee_name: '王小明', reason: '專案趕工', hours: 2 },
      { id: 2, employee_name: '李大華', reason: '月底盤點', hours: 3 },
    ]

    it('依員工姓名收斂 filteredOvertimes', async () => {
      getOvertimes.mockResolvedValue(paged(records))
      const wrapper = mountOvertimeView()
      await flushPromises()

      wrapper.vm.$.setupState.overtimeSearch = '王小'
      expect(wrapper.vm.$.setupState.filteredOvertimes).toEqual([records[0]])
      expect(wrapper.vm.$.setupState.overtimeShown).toBe(1)
      expect(wrapper.vm.$.setupState.overtimeTotal).toBe(2)
    })

    it('依事由也可命中', async () => {
      getOvertimes.mockResolvedValue(paged(records))
      const wrapper = mountOvertimeView()
      await flushPromises()

      wrapper.vm.$.setupState.overtimeSearch = '盤點'
      expect(wrapper.vm.$.setupState.filteredOvertimes).toEqual([records[1]])
    })

    it('清空搜尋字串時還原全部資料', async () => {
      getOvertimes.mockResolvedValue(paged(records))
      const wrapper = mountOvertimeView()
      await flushPromises()

      wrapper.vm.$.setupState.overtimeSearch = '王小'
      wrapper.vm.$.setupState.overtimeSearch = ''
      expect(wrapper.vm.$.setupState.filteredOvertimes).toEqual(records)
    })
  })

  // ── computed 統計 ─────────────────────────────────────────────────────────

  describe('totalHours & totalPay', () => {
    it('正確加總所有加班時數', async () => {
      getOvertimes.mockResolvedValue(paged([
          { id: 1, hours: 2, overtime_pay: 400 },
          { id: 2, hours: 3, overtime_pay: 600 },
        ]))
      const wrapper = mountOvertimeView()
      await flushPromises()

      expect(wrapper.vm.$.setupState.overtimeSummary.totalHours).toBe(5)
    })

    it('正確加總所有加班費', async () => {
      getOvertimes.mockResolvedValue(paged([
          { id: 1, hours: 2, overtime_pay: 400 },
          { id: 2, hours: 3, overtime_pay: 600 },
        ]))
      const wrapper = mountOvertimeView()
      await flushPromises()

      expect(wrapper.vm.$.setupState.overtimeSummary.totalPay).toBe(1000)
    })

    it('overtime_pay 為 null/undefined 時不影響計算', async () => {
      getOvertimes.mockResolvedValue(paged([
          { id: 1, hours: 2, overtime_pay: null },
          { id: 2, hours: 1, overtime_pay: undefined },
        ]))
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
      getOvertimes.mockResolvedValue(paged([]))

      await wrapper.vm.$.setupState.approveOvertime({ id: 10 }, true)
      await flushPromises()

      expect(approveOvertimeApi).toHaveBeenCalledWith(10, { approved: true })
      expect(ElMessage.success).toHaveBeenCalledWith('已核准')
      expect(getOvertimes).toHaveBeenCalled()
    })

    it('approved=false 時顯示已駁回', async () => {
      approveOvertimeApi.mockResolvedValue({})
      ElMessageBox.prompt.mockResolvedValue({ value: '事由不充分' })
      const wrapper = mountOvertimeView()
      await flushPromises()
      vi.clearAllMocks()
      getOvertimes.mockResolvedValue(paged([]))
      ElMessageBox.prompt.mockResolvedValue({ value: '事由不充分' })

      await wrapper.vm.$.setupState.approveOvertime({ id: 11 }, false)
      await flushPromises()

      expect(approveOvertimeApi).toHaveBeenCalledWith(11, {
        approved: false,
        rejection_reason: '事由不充分',
      })
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
      getOvertimes.mockResolvedValue(paged([]))

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
      getOvertimes.mockResolvedValue(paged([]))

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
      getOvertimes.mockResolvedValue(paged([]))

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
      getOvertimes.mockResolvedValue(paged([]))

      wrapper.vm.$.setupState.selectedOvertimes = [{ id: 3 }]
      wrapper.vm.$.setupState.batchRejectReason = '理由不充分'
      await wrapper.vm.$.setupState.confirmBatchReject()
      await flushPromises()

      expect(batchApproveOvertimes).toHaveBeenCalledWith([3], false, '理由不充分')
    })
  })

  // ── handleImportFile ──────────────────────────────────────────────────────

  describe('handleImportFile', () => {
    it('匯入成功（failed=0）時顯示成功訊息並刷新主列表', async () => {
      importOvertimes.mockResolvedValue({
        data: { total: 3, created: 3, failed: 0, errors: [] },
      })
      const wrapper = mountOvertimeView()
      await flushPromises()
      vi.clearAllMocks()
      getOvertimes.mockResolvedValue(paged([]))

      await wrapper.vm.$.setupState.handleImportFile({ raw: new File([], 'test.xlsx') })
      await flushPromises()

      expect(ElMessage.success).toHaveBeenCalledWith(expect.stringContaining('3'))
      expect(getOvertimes).toHaveBeenCalled()
    })

    it('匯入部分成功（created>0, failed>0）仍刷新主列表，且不誤報整體成功', async () => {
      importOvertimes.mockResolvedValue({
        data: { total: 3, created: 2, failed: 1, errors: ['第3行日期格式錯誤'] },
      })
      const wrapper = mountOvertimeView()
      await flushPromises()
      vi.clearAllMocks()
      getOvertimes.mockResolvedValue(paged([]))

      await wrapper.vm.$.setupState.handleImportFile({ raw: new File([], 'test.xlsx') })
      await flushPromises()

      // 已建立的 2 筆草稿需出現在主表 → 必須刷新（回歸：原本 failed>0 完全不刷新）
      expect(getOvertimes).toHaveBeenCalled()
      // 整體成功 toast 仍只在全部成功時顯示；部分失敗以 importResult 卡片呈現
      expect(ElMessage.success).not.toHaveBeenCalled()
      expect(wrapper.vm.$.setupState.importResult.failed).toBe(1)
    })

    it('匯入全部失敗（created=0）不刷新主列表', async () => {
      importOvertimes.mockResolvedValue({
        data: { total: 2, created: 0, failed: 2, errors: ['err1', 'err2'] },
      })
      const wrapper = mountOvertimeView()
      await flushPromises()
      vi.clearAllMocks()
      getOvertimes.mockResolvedValue(paged([]))

      await wrapper.vm.$.setupState.handleImportFile({ raw: new File([], 'test.xlsx') })
      await flushPromises()

      expect(getOvertimes).not.toHaveBeenCalled()
      expect(ElMessage.success).not.toHaveBeenCalled()
    })
  })

  // ── openApprovalLogs ──────────────────────────────────────────────────────

  describe('openApprovalLogs', () => {
    it('呼叫 getApprovalLogs("overtime", row.id) 並開啟 drawer', async () => {
      getApprovalLogs.mockResolvedValue({
        data: [{ id: 1, action: 'approved', approver_username: 'admin', approver_role: 'admin' }],
      })
      const wrapper = mountOvertimeView()
      await flushPromises()

      await wrapper.vm.$.setupState.openApprovalLogs({ id: 42 })
      await flushPromises()

      expect(getApprovalLogs).toHaveBeenCalledWith('overtime', 42)
      expect(wrapper.vm.$.setupState.approvalLogDrawerVisible).toBe(true)
      expect(wrapper.vm.$.setupState.approvalLogs).toHaveLength(1)
    })
  })

  // ── onDeleteSuccess ───────────────────────────────────────────────────────

  describe('onDeleteSuccess', () => {
    it('刪除成功後同時刷新主列表與待審列表', async () => {
      const wrapper = mountOvertimeView()
      await flushPromises()
      vi.clearAllMocks()
      getOvertimes.mockResolvedValue(paged([]))

      wrapper.vm.$.setupState.onDeleteSuccess()
      await flushPromises()

      // fetchOvertimes + fetchPendingOvertimes 皆呼叫 getOvertimes（參數不同）
      expect(getOvertimes).toHaveBeenCalledTimes(2)
    })
  })
})
