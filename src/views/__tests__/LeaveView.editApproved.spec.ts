import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'

// QA 2026-11-05 P2 #73：後端對「已核准」假單的任何編輯都會自動退回待審核（api/leaves.py
// _apply_leave_update_and_revoke），前端原本既不事先說明、儲存後也只說「請假記錄已更新」。
// 這組測試鎖：編輯已核准假單儲存前要明確確認；取消不送出；成功提示依 reset_to_pending 區分。

const route = vi.hoisted(() => ({ query: {} as Record<string, string> }))
const router = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => router }))

const paged = vi.hoisted(() => <T,>(items: T[]) => ({ items, total: items.length, page: 1, pageSize: 5000, hasMore: false }))
const api = vi.hoisted(() => ({
  getLeaves: vi.fn(),
  createLeave: vi.fn(),
  updateLeave: vi.fn(),
}))
vi.mock('@/api/leaves', () => ({
  getLeaves: api.getLeaves,
  createLeave: api.createLeave,
  updateLeave: api.updateLeave,
  approveLeave: vi.fn(),
  batchApproveLeaves: vi.fn(),
  getLeaveImportTemplate: vi.fn(),
  importLeaves: vi.fn(),
  getLeaveQuotas: vi.fn(() => Promise.resolve({ data: [] })),
  getWorkdayHours: vi.fn(() => Promise.resolve({ data: {} })),
}))

const ui = vi.hoisted(() => ({
  confirm: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}))
vi.mock('element-plus', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    ElMessage: Object.assign((...a: unknown[]) => ui.warning(...a), {
      success: (...a: unknown[]) => ui.success(...a),
      error: (...a: unknown[]) => ui.error(...a),
      warning: (...a: unknown[]) => ui.warning(...a),
    }),
    ElMessageBox: { confirm: (...a: unknown[]) => ui.confirm(...a) },
  }
})

vi.mock('@/composables/useIsMobile', async () => {
  const { ref } = await import('vue')
  return { useIsMobile: () => ({ isMobile: ref(false), cleanup: () => {} }) }
})
vi.mock('@/stores/employee', () => ({
  useEmployeeStore: () => ({ employees: [{ id: 12, name: '測試員工' }], fetchEmployees: vi.fn(() => Promise.resolve()) }),
}))
vi.mock('@/stores/approvalPolicy', () => ({
  useApprovalPolicyStore: () => ({ policies: [], fetchPolicies: vi.fn(() => Promise.resolve()) }),
}))
vi.mock('@/stores/notification', () => ({ useNotificationStore: () => ({ fetchSummary: vi.fn() }) }))
vi.mock('@/composables/useFormDraft', async () => {
  const { ref } = await import('vue')
  return {
    useFormDraft: () => ({
      hasDraft: ref(false),
      draftSavedAt: ref(null),
      maybePromptRestore: vi.fn(() => Promise.resolve()),
      clear: vi.fn(),
      clearDraft: vi.fn(),
      flush: vi.fn(),
    }),
  }
})

import LeaveView from '@/views/LeaveView.vue'

// el-form 用會暴露 validate() 的 stub，讓 saveLeave 能走到「確認已核准假單」那一段；
// 表單驗證規則本身不是這組測試要驗的東西（vitest 下真 ElForm.validate 恆回 true，所以驗證失敗的情境
// 只能靠 stub 製造）。預設通過，確認順序的案例會把 formState.valid 設成 false 模擬驗證失敗。
const formState = vi.hoisted(() => ({ valid: true }))
const stubs = {
  'el-tabs': { template: '<div><slot /></div>' },
  'el-tab-pane': { template: '<div><slot /></div>' },
  'el-card': { template: '<div><slot /></div>' },
  LoadingPanel: { template: '<div><slot /></div>' },
  'el-table': { name: 'ElTable', template: '<div class="el-table"><slot /></div>' },
  'el-table-column': { name: 'ElTableColumn', template: '<div></div>' },
  'el-dialog': { name: 'ElDialog', props: ['modelValue', 'title'], template: '<section v-if="modelValue" :data-title="title"><slot /><slot name="footer" /></section>' },
  'el-form': {
    template: '<form><slot /></form>',
    methods: { validate: () => Promise.resolve(formState.valid), clearValidate: () => {} },
  },
  'el-form-item': { template: '<div><slot /></div>' },
}

type Vm = {
  openEditWithDraft: (row: Record<string, unknown>) => Promise<void>
  openCreateWithDraft: () => Promise<void>
  saveLeave: () => Promise<void>
  form: Record<string, unknown>
}

// annual 假別 + 一個平日整天：避開「事假需提前 2 日」「病假 4h 倍數」等規則確認，
// 讓 ElMessageBox.confirm 只會因為「編輯已核准假單」被呼叫。
const makeLeave = (over: Record<string, unknown> = {}) => ({
  id: 77,
  employee_id: 12,
  employee_name: '測試員工',
  leave_type: 'annual',
  leave_type_label: '特休',
  start_date: '2026-08-03',
  end_date: '2026-08-03',
  start_time: null,
  end_time: null,
  leave_hours: 8,
  status: 'approved',
  reason: '家中有事',
  attachment_paths: [],
  substitute_status: 'not_required',
  is_hospitalized: false,
  ...over,
})

const mountView = async () => {
  const w = shallowMount(LeaveView, { global: { stubs } })
  await flushPromises()
  return { w, vm: w.vm as unknown as Vm }
}

const confirmCalls = () => ui.confirm.mock.calls.map((c) => ({ message: String(c[0]), title: String(c[1]) }))

beforeEach(() => {
  vi.clearAllMocks()
  formState.valid = true
  route.query = {}
  api.getLeaves.mockResolvedValue(paged([]))
  api.updateLeave.mockResolvedValue({ data: { message: '請假記錄已更新', reset_to_pending: false } })
  api.createLeave.mockResolvedValue({ data: { message: '請假記錄已新增' } })
  ui.confirm.mockResolvedValue('confirm')
})

describe('LeaveView 編輯已核准假單：退回待審核的確認', () => {
  it('編輯已核准假單按儲存：先跳確認並說明會退回待審；取消則不送出 updateLeave', async () => {
    ui.confirm.mockRejectedValue('cancel')
    const { vm } = await mountView()
    await vm.openEditWithDraft(makeLeave({ status: 'approved' }))
    await vm.saveLeave()
    await flushPromises()

    const calls = confirmCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0].title).toBe('編輯已核准假單')
    expect(calls[0].message).toContain('退回「待審核」')
    expect(calls[0].message).toContain('重新核准')
    expect(api.updateLeave).not.toHaveBeenCalled()
    expect(ui.success).not.toHaveBeenCalled()
  })

  it('確認後才送出 updateLeave（一次，帶該假單 id）', async () => {
    const { vm } = await mountView()
    await vm.openEditWithDraft(makeLeave({ id: 77, status: 'approved' }))
    await vm.saveLeave()
    await flushPromises()

    expect(confirmCalls().map((c) => c.title)).toEqual(['編輯已核准假單'])
    expect(api.updateLeave).toHaveBeenCalledTimes(1)
    expect(api.updateLeave.mock.calls[0][0]).toBe(77)
  })

  it('成功提示依 reset_to_pending 區分：true 提示已退回待審核並需重新核准，false 維持原文案', async () => {
    api.updateLeave.mockResolvedValue({ data: { message: 'x', reset_to_pending: true } })
    const first = await mountView()
    await first.vm.openEditWithDraft(makeLeave({ status: 'approved' }))
    await first.vm.saveLeave()
    await flushPromises()
    expect(ui.success).toHaveBeenCalledTimes(1)
    const resetText = String(ui.success.mock.calls[0][0])
    expect(resetText).toContain('退回待審核')
    expect(resetText).toContain('重新核准')

    ui.success.mockClear()
    api.updateLeave.mockResolvedValue({ data: { message: 'x', reset_to_pending: false } })
    const second = await mountView()
    await second.vm.openEditWithDraft(makeLeave({ status: 'approved' }))
    await second.vm.saveLeave()
    await flushPromises()
    expect(ui.success).toHaveBeenCalledTimes(1)
    expect(ui.success).toHaveBeenCalledWith('請假記錄已更新')
  })

  // schema 的 LeaveUpdateResultOut.reset_to_pending 是 boolean | null 且可省略：只有明確的 true 才算退審，
  // null／未帶不能被當成退審（否則會對沒被退審的單誤報「已退回待審核」）。
  it.each([
    ['null', { message: 'x', reset_to_pending: null }],
    ['未帶欄位（undefined）', { message: 'x' }],
  ])('後端回 reset_to_pending 為 %s → 成功提示維持「請假記錄已更新」，不誤報退審', async (_label, data) => {
    api.updateLeave.mockResolvedValue({ data })
    const { vm } = await mountView()
    await vm.openEditWithDraft(makeLeave({ status: 'approved' }))
    await vm.saveLeave()
    await flushPromises()

    expect(api.updateLeave).toHaveBeenCalledTimes(1)
    expect(ui.success).toHaveBeenCalledTimes(1)
    expect(ui.success).toHaveBeenCalledWith('請假記錄已更新')
  })

  it('開啟時是待審核、儲存時後端實際退審（別人剛好核准了）：提示仍依回應告知已退回', async () => {
    api.updateLeave.mockResolvedValue({ data: { message: 'x', reset_to_pending: true } })
    const { vm } = await mountView()
    await vm.openEditWithDraft(makeLeave({ status: 'pending' }))
    await vm.saveLeave()
    await flushPromises()

    expect(ui.confirm).not.toHaveBeenCalled()
    expect(String(ui.success.mock.calls[0][0])).toContain('退回待審核')
  })

  it('護欄：編輯待審核／已駁回假單不彈該確認，直接送出、提示維持原文案', async () => {
    for (const status of ['pending', 'rejected']) {
      vi.clearAllMocks()
      api.updateLeave.mockResolvedValue({ data: { message: 'x', reset_to_pending: false } })
      ui.confirm.mockResolvedValue('confirm')
      const { vm } = await mountView()
      await vm.openEditWithDraft(makeLeave({ status }))
      await vm.saveLeave()
      await flushPromises()

      expect(ui.confirm).not.toHaveBeenCalled()
      expect(api.updateLeave).toHaveBeenCalledTimes(1)
      expect(ui.success).toHaveBeenCalledWith('請假記錄已更新')
    }
  })

  it('護欄：新增假單不彈該確認；先編輯過已核准假單再開新增，狀態不會殘留', async () => {
    ui.confirm.mockRejectedValue('cancel')
    const { vm } = await mountView()
    // 先開（並取消儲存）一張已核准假單，editingStatus 若沒被 resetForm 清掉就會殘留
    await vm.openEditWithDraft(makeLeave({ status: 'approved' }))
    await vm.saveLeave()
    await flushPromises()
    expect(ui.confirm).toHaveBeenCalledTimes(1)
    ui.confirm.mockClear()
    ui.confirm.mockResolvedValue('confirm')

    await vm.openCreateWithDraft()
    Object.assign(vm.form, {
      employee_id: 12,
      leave_type: 'annual',
      start_date: '2026-08-03',
      end_date: '2026-08-03',
      leave_hours: 8,
    })
    await vm.saveLeave()
    await flushPromises()

    expect(ui.confirm).not.toHaveBeenCalled()
    expect(api.createLeave).toHaveBeenCalledTimes(1)
    expect(api.updateLeave).not.toHaveBeenCalled()
    expect(ui.success).toHaveBeenCalledWith('請假記錄已新增')
  })
})

// 「退回待審核」確認必須排在表單驗證與其他確認「之後」、真正送出「之前」：
// 驗證沒過或使用者在先前的確認取消時，不該再被問一次會退審的問題。
describe('LeaveView 編輯已核准假單：確認的先後順序', () => {
  const titles = () => confirmCalls().map((c) => c.title)
  // 病假 3 小時違反「須以 4 小時為單位」→ 會先跳「違反請假規則」確認（其他確認條件皆不成立）
  const violatingSick = () => makeLeave({ status: 'approved', leave_type: 'sick', leave_hours: 3 })

  it('表單驗證失敗：不跳「退回待審核」確認，也不送出', async () => {
    formState.valid = false
    const { vm } = await mountView()
    await vm.openEditWithDraft(makeLeave({ status: 'approved' }))
    await vm.saveLeave()
    await flushPromises()

    expect(ui.confirm).not.toHaveBeenCalled()
    expect(api.updateLeave).not.toHaveBeenCalled()
    expect(ui.success).not.toHaveBeenCalled()
  })

  it('規則違反確認被取消：不再跳「退回待審核」確認，也不送出', async () => {
    ui.confirm.mockImplementation((_msg: unknown, title: unknown) =>
      title === '違反請假規則' ? Promise.reject('cancel') : Promise.resolve('confirm'),
    )
    const { vm } = await mountView()
    await vm.openEditWithDraft(violatingSick())
    await vm.saveLeave()
    await flushPromises()

    expect(titles()).toEqual(['違反請假規則'])
    expect(api.updateLeave).not.toHaveBeenCalled()
    expect(ui.success).not.toHaveBeenCalled()
  })

  it('規則違反確認通過：兩個確認依序出現（先規則、後退審），之後才送出一次', async () => {
    const { vm } = await mountView()
    await vm.openEditWithDraft(violatingSick())
    await vm.saveLeave()
    await flushPromises()

    expect(titles()).toEqual(['違反請假規則', '編輯已核准假單'])
    expect(api.updateLeave).toHaveBeenCalledTimes(1)
    expect(api.updateLeave.mock.calls[0][0]).toBe(77)
  })
})
