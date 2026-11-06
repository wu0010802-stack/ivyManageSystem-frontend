import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import LeaveQuotaManager from '../LeaveQuotaManager.vue'

const getLeaveQuotas = vi.fn()
vi.mock('@/api/leaves', () => ({
  getLeaveQuotas: (...a: unknown[]) => getLeaveQuotas(...a),
  initLeaveQuotas: vi.fn(),
  updateLeaveQuota: vi.fn(),
}))
vi.mock('@/stores/employee', () => ({
  useEmployeeStore: () => ({ employees: [{ id: 5, name: '許志明' }] }),
}))
vi.mock('@/api/leaveQuotaExpiry', () => ({
  getEarliestExpiringGrantForEmployee: vi.fn(() => Promise.resolve(null)),
}))
vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), error: vi.fn() } }))

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

// el-table 未安裝 Element Plus 時不提供 scoped slot context，需 stub 成會 render slot 的殼
// FormDialog：儲存配額的「調整原因」確認框（F90）。本檔只驗內嵌版面，不驗該對話框，
// 以 stub 擋掉它內部的 el-dialog，否則「無 el-dialog 包裹」的斷言會抓到確認框自己。
// 原因對話框的行為見 LeaveQuotaManager.reason.test.ts。
const STUBS = {
  'el-table': { template: '<div><slot /></div>' },
  'el-table-column': { template: '<div></div>', props: ['label'] },
  FormDialog: true,
}

function mountManager() {
  return mount(LeaveQuotaManager, { global: { stubs: STUBS } })
}

describe('LeaveQuotaManager', () => {
  beforeEach(() => {
    getLeaveQuotas.mockReset()
    getLeaveQuotas.mockResolvedValue({ data: [] })
  })

  it('2026-09-15 起固定內嵌（無 el-dialog 包裹），不再有 visible/update:visible 契約', () => {
    const w = mountManager()
    expect(w.find('el-dialog').exists()).toBe(false)
    expect(w.find('.quota-manager').exists()).toBe(true)
  })

  it('focusEmployee(id)：供配額總覽表「調整」呼叫，選定員工並立即查詢', async () => {
    const w = mountManager()
    await flushPromises()

    w.vm.focusEmployee(5)
    await flushPromises()

    expect(getLeaveQuotas).toHaveBeenCalledWith(expect.objectContaining({ employee_id: 5 }))
    expect(w.vm.$.setupState.quotaMgrEmpId).toBe(5)
  })
})
