import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

/**
 * 2026-10-31 SUP-01：沒有 EMPLOYEES_READ 的已登入角色（主任）員工下拉改走
 * /employees/options；有權限或未登入（既有行為）仍走完整 /employees。
 */

vi.mock('@/api/employees', () => ({
  getEmployees: vi.fn(),
  getEmployeeOptions: vi.fn(),
}))
vi.mock('@/utils/auth', () => ({
  getUserInfo: vi.fn(),
  hasPermission: vi.fn(),
}))

import * as employeesApi from '@/api/employees'
import * as auth from '@/utils/auth'
import { useEmployeeStore } from '../employee'

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>

describe('employee store — 依 EMPLOYEES_READ 選擇來源', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    asMock(employeesApi.getEmployees).mockResolvedValue({ data: [{ id: 1, name: '全量' }], headers: {} })
    asMock(employeesApi.getEmployeeOptions).mockResolvedValue({
      data: [{ id: 2, employee_id: 'E2', name: '選項', is_active: true }],
    })
  })

  it('已登入且無 EMPLOYEES_READ → 走 options，不打 /employees', async () => {
    asMock(auth.getUserInfo).mockReturnValue({ role: 'supervisor' })
    asMock(auth.hasPermission).mockReturnValue(false)
    const store = useEmployeeStore()
    await store.fetchEmployees(true)
    expect(employeesApi.getEmployeeOptions).toHaveBeenCalledTimes(1)
    expect(employeesApi.getEmployees).not.toHaveBeenCalled()
    expect(store.employees).toEqual([{ id: 2, employee_id: 'E2', name: '選項', is_active: true }])
    expect(store.teacherList).toEqual([])
  })

  it('有 EMPLOYEES_READ → 走完整 /employees', async () => {
    asMock(auth.getUserInfo).mockReturnValue({ role: 'hr' })
    asMock(auth.hasPermission).mockReturnValue(true)
    const store = useEmployeeStore()
    await store.fetchEmployees(true)
    expect(employeesApi.getEmployees).toHaveBeenCalled()
    expect(employeesApi.getEmployeeOptions).not.toHaveBeenCalled()
  })

  it('未登入（無使用者資訊）維持原行為走 /employees', async () => {
    asMock(auth.getUserInfo).mockReturnValue(null)
    asMock(auth.hasPermission).mockReturnValue(false)
    const store = useEmployeeStore()
    await store.fetchEmployees(true)
    expect(employeesApi.getEmployees).toHaveBeenCalled()
    expect(employeesApi.getEmployeeOptions).not.toHaveBeenCalled()
  })
})
