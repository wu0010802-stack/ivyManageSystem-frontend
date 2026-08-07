// src/components/employee/__tests__/EmployeeFormDialog.createGuidance.test.ts
// 新增模式 saveCreate 成功後的下一步引導（finding #5 後半）：
// - 成功後先發持久 toast「員工已新增」（reviewer 裁定：與引導框並存，MessageBox 可被 Esc 快速關閉）
// - createEmployee response 含 id（真實契約 EmployeeCreateResultOut）→ MessageBox 引導 + 「前往詳情頁」按鈕，
//   確認後導向 /employees/:id
// - 使用者取消引導 → 不導頁
// - response 無 id（防禦性退化路徑）→ 不跳 MessageBox，改用純文案 notification，不導頁
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import EmployeeFormDialog from '../EmployeeFormDialog.vue'

const createEmployeeMock = vi.hoisted(() => vi.fn())
vi.mock('@/api/employees', () => ({
  createEmployee: (...a: unknown[]) => createEmployeeMock(...a),
  updateEmployeeBasic: vi.fn(),
  updateEmployeeSalary: vi.fn(),
}))

vi.mock('@/api/config', () => ({
  getPositionSalary: vi.fn().mockResolvedValue({ data: {} }),
  // 多租戶 CT-FIX-09：EmployeeFormDialog 經 useTenantDictionaries 讀 per-tenant
  // 職稱對照；回空物件即等同「退 constants/employee.ts 的 fallback」。
  getPositionMapping: vi.fn().mockResolvedValue({ data: { title_to_grade: {}, position_salary_key: {} } }),
}))

vi.mock('@/stores/config', () => ({
  useConfigStore: () => ({ jobTitles: [], fetchJobTitles: vi.fn() }),
}))
vi.mock('@/stores/classroom', () => ({
  useClassroomStore: () => ({ classrooms: [], fetchClassrooms: vi.fn() }),
}))

const pushMock = vi.hoisted(() => vi.fn())
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

const confirmMock = vi.hoisted(() => vi.fn())
const notificationMock = vi.hoisted(() => vi.fn())
const messageSuccessMock = vi.hoisted(() => vi.fn())
vi.mock('element-plus', async (orig) => {
  const actual = await orig() as Record<string, unknown>
  return {
    ...actual,
    ElMessage: { success: messageSuccessMock, error: vi.fn(), warning: vi.fn(), info: vi.fn() },
    ElMessageBox: { confirm: (...a: unknown[]) => confirmMock(...a) },
    ElNotification: (...a: unknown[]) => notificationMock(...a),
  }
})

type DialogVm = {
  openCreate: () => void
  form: Record<string, unknown>
  formRef: { validate: (cb: (valid: boolean, fields?: unknown) => void) => void } | null
  saveCreate: () => Promise<void>
}

function mountDialog() {
  return shallowMount(EmployeeFormDialog, { global: { stubs: { teleport: true } } })
}

async function fillAndSave(wrapper: ReturnType<typeof mountDialog>) {
  const vm = wrapper.vm as unknown as DialogVm
  vm.openCreate()
  await flushPromises()
  vm.form.name = '王小明'
  vm.formRef = { validate: (cb) => cb(true, {}) }
  await vm.saveCreate()
  await flushPromises()
  return vm
}

describe('EmployeeFormDialog 新增後下一步引導', () => {
  beforeEach(() => {
    createEmployeeMock.mockReset()
    confirmMock.mockReset()
    notificationMock.mockReset()
    messageSuccessMock.mockReset()
    pushMock.mockReset()
    // router.push 回傳 Promise（實作端鏈 .catch() 吞導航攔截 rejection），mock 需對齊真實契約
    pushMock.mockResolvedValue(undefined)
  })

  it('response 含 id、使用者按「前往詳情頁」→ 導向 /employees/:id', async () => {
    createEmployeeMock.mockResolvedValue({ data: { employee_id: '114005', id: 42, message: '員工已建立' } })
    confirmMock.mockResolvedValue('confirm')
    const wrapper = mountDialog()
    await fillAndSave(wrapper)

    expect(createEmployeeMock).toHaveBeenCalledOnce()
    // 持久成功 toast 與引導框並存（reviewer 裁定）：引導框被快速關閉時成功回饋仍在
    expect(messageSuccessMock).toHaveBeenCalledWith('員工已新增')
    expect(confirmMock).toHaveBeenCalledOnce()
    const [message, , options] = confirmMock.mock.calls[0] as [string, string, Record<string, unknown>]
    expect(message).toContain('薪資')
    expect(message).toContain('證照')
    expect(message).toContain('合約')
    expect(options.confirmButtonText).toBe('前往詳情頁')
    expect(pushMock).toHaveBeenCalledWith({ name: 'employee-detail', params: { id: 42 } })
    expect(wrapper.emitted('saved')).toBeTruthy()
  })

  it('response 含 id、使用者取消引導 → 不導頁', async () => {
    createEmployeeMock.mockResolvedValue({ data: { employee_id: '114006', id: 43, message: '員工已建立' } })
    confirmMock.mockRejectedValue('cancel')
    const wrapper = mountDialog()
    await fillAndSave(wrapper)

    expect(confirmMock).toHaveBeenCalledOnce()
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('防禦性退化路徑：response 無 id → 不跳 MessageBox，改用純文案 notification，不導頁', async () => {
    // 真實契約 EmployeeCreateResultOut.id 為必填，此案例模擬非預期回應形狀
    createEmployeeMock.mockResolvedValue({ data: { employee_id: '114007', message: '員工已建立' } })
    const wrapper = mountDialog()
    await fillAndSave(wrapper)

    expect(confirmMock).not.toHaveBeenCalled()
    expect(notificationMock).toHaveBeenCalledOnce()
    expect(messageSuccessMock).toHaveBeenCalledWith('員工已新增') // toast 在退化路徑同樣保留
    expect(pushMock).not.toHaveBeenCalled()
  })
})
