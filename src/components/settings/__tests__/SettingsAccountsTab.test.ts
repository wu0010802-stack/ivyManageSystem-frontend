import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus, { ElMessage, ElMessageBox } from 'element-plus'

vi.mock('@/api/auth', () => {
  const mockPermissionDefinition = {
    permissions: {
      EMPLOYEES_READ: { label: '員工檢視', value: 'EMPLOYEES_READ' },
      EMPLOYEES_WRITE: { label: '員工編輯', value: 'EMPLOYEES_WRITE' },
      SALARY_READ: { label: '薪資檢視', value: 'SALARY_READ' },
      SALARY_WRITE: { label: '薪資編輯', value: 'SALARY_WRITE' },
      DASHBOARD: { label: '儀表板', value: 'DASHBOARD' },
      STUDENTS_READ: { label: '學生檢視', value: 'STUDENTS_READ', scope_options: ['own_class', 'all'] },
    },
    groups: [
      { name: '員工管理', permissions: [], split_permissions: [{ module: '員工', read: 'EMPLOYEES_READ', write: 'EMPLOYEES_WRITE' }] },
      { name: '薪資', permissions: [], split_permissions: [{ module: '薪資', read: 'SALARY_READ', write: 'SALARY_WRITE' }] },
      { name: '基礎', permissions: ['DASHBOARD'] },
    ],
    roles: {
      admin: { label: '系統管理員', description: '唯一能改帳號、系統設定', permissions: ['*'], is_core: true, flags: ['super_admin'] },
      principal: { label: '園長', description: '業務全包 + 薪資審視，不動帳號', permissions: ['DASHBOARD', 'EMPLOYEES_READ', 'SALARY_READ'], is_core: true, flags: [] },
      supervisor: { label: '主管', description: '教務管理、招生轉換、考核全程', permissions: ['DASHBOARD', 'EMPLOYEES_READ'], is_core: true, flags: [] },
      hr: { label: '人事管理員', description: '員工資料、薪資發放、年終、廠商付款', permissions: ['DASHBOARD', 'EMPLOYEES_READ', 'EMPLOYEES_WRITE', 'SALARY_READ', 'SALARY_WRITE'], is_core: true, flags: [] },
      accountant: { label: '會計', description: '純財務（薪資/學費/廠商/年終）', permissions: ['DASHBOARD', 'EMPLOYEES_READ', 'SALARY_READ', 'SALARY_WRITE'], is_core: true, flags: [] },
      teacher: { label: '教師', description: '公告、考勤、放學接送、學生檔案', permissions: ['DASHBOARD'], is_core: true, flags: ['portal_only'] },
      parent: { label: '家長', description: '家長端登入，無管理端權限', permissions: [], is_core: true, flags: ['parent', 'portal_only'] },
    },
  }
  return {
    getUsers: vi.fn().mockResolvedValue({
      data: [
        { id: 1, username: 'wang01', employee_name: '王小明', role: 'admin', permission_names: ['*'], is_active: true, last_login: '2026-07-10T17:35:14.324936' },
        { id: 2, username: 'lin02', employee_name: '林老師', role: 'teacher', permission_names: null, is_active: false, last_login: null },
        { id: 3, username: 'chen03', employee_name: '陳主任', role: 'supervisor', permission_names: ['DASHBOARD'], is_active: true, last_login: null },
        { id: 4, username: 'parent1', employee_name: '', role: 'parent', permission_names: [], is_active: true, last_login: null },
      ],
    }),
    getPermissions: vi.fn().mockResolvedValue({ data: mockPermissionDefinition }),
    createUser: vi.fn().mockResolvedValue({ data: {} }),
    updateUser: vi.fn().mockResolvedValue({ data: {} }),
    deleteUser: vi.fn().mockResolvedValue({ data: { ok: true } }),
    resetPassword: vi.fn().mockResolvedValue({ data: { ok: true } }),
  }
})

vi.mock('@/stores/employee', async () => {
  const { ref } = await import('vue')
  return {
    useEmployeeStore: () => ({
      fetchEmployees: vi.fn(),
      employees: ref([]),
    }),
  }
})

vi.mock('@/api/permissions_admin', () => ({
  createRole: vi.fn().mockResolvedValue({ data: {} }),
  updateRole: vi.fn().mockResolvedValue({ data: {} }),
  deleteRole: vi.fn().mockResolvedValue({ data: {} }),
}))

const replace = vi.fn()
let mockQuery: Record<string, unknown> = {}
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: mockQuery }),
  useRouter: () => ({ replace }),
}))

import SettingsAccountsTab from '../SettingsAccountsTab.vue'
import { createUser, updateUser, getUsers } from '@/api/auth'
import { createRole } from '@/api/permissions_admin'

describe('SettingsAccountsTab — role card UX', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery = {}
    replace.mockClear()
  })

  async function mountAndOpenAddDialog() {
    const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
    await flushPromises()
    // 「新增帳號」按鈕在 .toolbar-right 內，type="primary"；「管理角色」無 type="primary"
    const addBtn = wrapper.find('.toolbar-right button.el-button--primary')
    await addBtn.trigger('click')
    await flushPromises()
    await nextTick()
    return wrapper
  }

  // mountTab：掛載元件並開啟新增帳號 dialog（使 _activeForm 指向 userForm，讓 deviationCount 非零）
  async function mountTab() {
    const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
    await flushPromises()
    const addBtn = wrapper.find('.toolbar-right button.el-button--primary')
    await addBtn.trigger('click')
    await flushPromises()
    await nextTick()
    return wrapper
  }

  it('saveUser 送出中重複呼叫不重送（saving 守衛，防序列雙擊跳誤導性「建立失敗」toast）', async () => {
    const wrapper = await mountTab()
    const vm = wrapper.vm as unknown as {
      userForm: Record<string, unknown>
      saveUser: () => Promise<void>
    }
    let resolve!: (v: unknown) => void
    vi.mocked(createUser).mockReturnValueOnce(new Promise((r) => { resolve = r }) as ReturnType<typeof createUser>)
    Object.assign(vm.userForm, { employee_id: 1, username: 'u1', password: 'p1', role: 'teacher' })
    const p1 = vm.saveUser()
    const p2 = vm.saveUser()
    expect(vi.mocked(createUser)).toHaveBeenCalledTimes(1)
    resolve({ data: {} })
    await Promise.all([p1, p2])
    await flushPromises()
  })

  it('新增帳號 dialog 資料驅動角色卡：RoleCardsGrid 元件存在', async () => {
    const wrapper = await mountAndOpenAddDialog()
    expect(wrapper.findComponent({ name: 'RoleCardsGrid' }).exists()).toBe(true)
  })

  it('accounts-toolbar 有「管理角色」按鈕', async () => {
    const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
    await flushPromises()
    const header = wrapper.find('.accounts-toolbar')
    expect(header.text()).toContain('管理角色')
  })

  it('filteredUsers 依關鍵字與角色篩選收斂', async () => {
    // getUsers mock 已回三筆：wang01/王小明/admin、lin02/林老師/teacher、chen03/陳主任/supervisor
    const wrapper = await mountTab()
    const vm = wrapper.vm as unknown as {
      keyword: string
      roleFilter: string
      filteredUsers: { username: string }[]
    }
    vm.keyword = '林'
    await nextTick()
    expect(vm.filteredUsers.map((u) => u.username)).toEqual(['lin02'])
    vm.keyword = ''
    vm.roleFilter = 'supervisor'
    await nextTick()
    expect(vm.filteredUsers.map((u) => u.username)).toEqual(['chen03'])
  })

  it('onRowCommand 把 reset/delete 導到對應 handler', async () => {
    const wrapper = await mountTab()
    const vm = wrapper.vm as unknown as {
      onRowCommand: (cmd: string, row: Record<string, unknown>) => void
      resetDialogVisible: boolean
    }
    const row = { id: 9, username: 'x' }

    // reset → handleResetPassword → resetDialogVisible = true
    vm.onRowCommand('reset', row)
    await nextTick()
    expect(vm.resetDialogVisible).toBe(true)

    // delete → handleDeleteUser → ElMessageBox.confirm 被呼叫
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    vm.onRowCommand('delete', row)
    await nextTick()
    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining('x'),
      expect.any(String),
      expect.any(Object),
    )
    confirmSpy.mockRestore()
  })

  it('空狀態在有篩選時顯示「清除篩選」按鈕，點擊後重置 keyword 與 roleFilter', async () => {
    const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
    await flushPromises()
    const vm = wrapper.vm as unknown as { keyword: string; roleFilter: string; filteredUsers: unknown[] }
    // 篩出空集合 → el-table 顯示 #empty slot
    vm.keyword = 'zzz_無此帳號'
    await flushPromises()
    await nextTick()
    expect(vm.filteredUsers.length).toBe(0)
    // 有篩選時，空狀態出現「清除篩選」按鈕
    const clearBtn = wrapper.find('[data-testid="clear-filters"]')
    expect(clearBtn.exists()).toBe(true)
    await clearBtn.trigger('click')
    await nextTick()
    expect(vm.keyword).toBe('')
    expect(vm.roleFilter).toBe('')
  })

  it('最後登入：ISO 字串格式化顯示、null 顯示「從未登入」', async () => {
    const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('2026/7/10')       // formatDateTimeTW 輸出
    expect(text).not.toContain('T17:35')      // 原始 ISO 不再直出
    expect(text).toContain('從未登入')
  })

  describe('停用/啟用帳號', () => {
    async function mountPlain() {
      const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
      await flushPromises()
      return wrapper.vm as unknown as { handleToggleActive: (u: Record<string, unknown>) => Promise<void> }
    }

    it('停用：confirm 後送 is_active:false', async () => {
      const vm = await mountPlain()
      const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
      await vm.handleToggleActive({ id: 3, username: 'chen03', is_active: true })
      expect(confirmSpy).toHaveBeenCalledWith(
        expect.stringContaining('chen03'),
        expect.any(String),
        expect.any(Object),
      )
      expect(vi.mocked(updateUser)).toHaveBeenCalledWith(3, { is_active: false })
      confirmSpy.mockRestore()
    })

    it('停用 confirm 取消 → 不送 API', async () => {
      const vm = await mountPlain()
      const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
      await vm.handleToggleActive({ id: 3, username: 'chen03', is_active: true })
      expect(vi.mocked(updateUser)).not.toHaveBeenCalled()
      confirmSpy.mockRestore()
    })

    it('啟用：不 confirm 直接送 is_active:true', async () => {
      const vm = await mountPlain()
      const confirmSpy = vi.spyOn(ElMessageBox, 'confirm')
      await vm.handleToggleActive({ id: 5, username: 'x', is_active: false })
      expect(confirmSpy).not.toHaveBeenCalled()
      expect(vi.mocked(updateUser)).toHaveBeenCalledWith(5, { is_active: true })
      confirmSpy.mockRestore()
    })

    it('onRowCommand toggle-active 導到 handleToggleActive', async () => {
      const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
      await flushPromises()
      const vm = wrapper.vm as unknown as { onRowCommand: (cmd: string, row: Record<string, unknown>) => void }
      vm.onRowCommand('toggle-active', { id: 7, username: 'y', is_active: false })
      await flushPromises()
      expect(vi.mocked(updateUser)).toHaveBeenCalledWith(7, { is_active: true })
    })
  })

  describe('受眾分流（教職員/家長）', () => {
    it('預設 staff 視圖：filteredUsers 不含家長、normalize ?view=staff', async () => {
      const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
      await flushPromises()
      const vm = wrapper.vm as unknown as { audience: string; filteredUsers: { username: string }[] }
      expect(vm.audience).toBe('staff')
      expect(vm.filteredUsers.map((u) => u.username)).not.toContain('parent1')
      expect(replace).toHaveBeenCalledWith({ query: { view: 'staff' } })
    })

    it('deep link ?view=parent → 家長視圖，filteredParentUsers 只含家長', async () => {
      mockQuery = { view: 'parent' }
      const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
      await flushPromises()
      const vm = wrapper.vm as unknown as { audience: string; filteredParentUsers: { username: string }[] }
      expect(vm.audience).toBe('parent')
      expect(vm.filteredParentUsers.map((u) => u.username)).toEqual(['parent1'])
      expect(replace).not.toHaveBeenCalled()
    })

    it('家長視圖 keyword 只比對帳號', async () => {
      mockQuery = { view: 'parent' }
      const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
      await flushPromises()
      const vm = wrapper.vm as unknown as { keyword: string; filteredParentUsers: unknown[] }
      vm.keyword = 'zzz'
      await nextTick()
      expect(vm.filteredParentUsers.length).toBe(0)
    })

    it('onAudienceChange → replace 更新 ?view=', async () => {
      const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
      await flushPromises()
      replace.mockClear()
      const vm = wrapper.vm as unknown as { onAudienceChange: (v: string) => void }
      vm.onAudienceChange('parent')
      expect(replace).toHaveBeenCalledWith({ query: { view: 'parent' } })
    })

    it('角色篩選選項排除家長', async () => {
      const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
      await flushPromises()
      const vm = wrapper.vm as unknown as { roleFilterOptions: { code: string }[] }
      expect(vm.roleFilterOptions.map((r) => r.code)).not.toContain('parent')
    })
  })

  it('統計概覽：staff 與 parent 數字正確且渲染於 .accounts-stats', async () => {
    const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
    await flushPromises()
    const vm = wrapper.vm as unknown as {
      staffStats: { total: number; active: number; neverLoggedIn: number; custom: number }
      parentStats: { total: number; active: number }
    }
    // staff: wang01(admin,*,active,有登入)、lin02(teacher,停用,未登入)、chen03(supervisor,自訂,未登入)
    expect(vm.staffStats).toEqual({ total: 3, active: 2, neverLoggedIn: 2, custom: 1 })
    expect(vm.parentStats).toEqual({ total: 1, active: 1 })
    const stats = wrapper.find('.accounts-stats')
    expect(stats.exists()).toBe(true)
    expect(stats.text()).toContain('自訂權限 1')
  })

  it('fetchUsers 失敗 → 空狀態顯示「帳號載入失敗」與重試；重試成功恢復資料', async () => {
    vi.mocked(getUsers).mockRejectedValueOnce(new Error('boom'))
    const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
    await flushPromises()
    const retryBtn = wrapper.find('[data-testid="retry-fetch"]')
    expect(retryBtn.exists()).toBe(true)
    expect(wrapper.text()).toContain('帳號載入失敗')
    await retryBtn.trigger('click')
    await flushPromises()
    const vm = wrapper.vm as unknown as { filteredUsers: unknown[] }
    expect(vm.filteredUsers.length).toBeGreaterThan(0)
    expect(wrapper.find('[data-testid="retry-fetch"]').exists()).toBe(false)
  })

  describe('偏離帳號唯讀摘要與另存自訂角色', () => {
    it('編輯偏離帳號：editingDeviation 列出多/少的權限 label', async () => {
      const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
      await flushPromises()
      const vm = wrapper.vm as unknown as {
        handleEditUser: (u: Record<string, unknown>) => void
        editingDeviation: { extra: string[]; missing: string[] } | null
      }
      // chen03 為 supervisor 但只有 DASHBOARD（缺 EMPLOYEES_READ 等預設）→ 偏離
      vm.handleEditUser({ id: 3, username: 'chen03', role: 'supervisor', permission_names: ['DASHBOARD'] })
      await nextTick()
      expect(vm.editingDeviation).not.toBeNull()
      expect(vm.editingDeviation!.missing.length).toBeGreaterThan(0)
    })

    it('permission_names 為 null（角色預設 resolve）→ 無偏離摘要', async () => {
      const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
      await flushPromises()
      const vm = wrapper.vm as unknown as {
        handleEditUser: (u: Record<string, unknown>) => void
        editingDeviation: unknown
      }
      vm.handleEditUser({ id: 2, username: 'lin02', role: 'teacher', permission_names: null })
      await nextTick()
      expect(vm.editingDeviation).toBeNull()
    })

    it('saveEditUser：payload 只有 role、不含 permission_names', async () => {
      const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
      await flushPromises()
      const vm = wrapper.vm as unknown as {
        handleEditUser: (u: Record<string, unknown>) => void
        saveEditUser: () => Promise<void>
      }
      vm.handleEditUser({ id: 3, username: 'chen03', role: 'supervisor', permission_names: ['DASHBOARD'] })
      await vm.saveEditUser()
      expect(vi.mocked(updateUser)).toHaveBeenCalledWith(3, { role: 'supervisor' })
    })

    it('另存自訂角色：createRole（permissions=現值）→ updateUser（role=新 code）', async () => {
      const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
      await flushPromises()
      const vm = wrapper.vm as unknown as {
        handleEditUser: (u: Record<string, unknown>) => void
        openSaveAsRole: () => void
        saveAsRoleForm: { code: string; label: string }
        submitSaveAsRole: () => Promise<void>
      }
      vm.handleEditUser({ id: 3, username: 'chen03', role: 'supervisor', permission_names: ['DASHBOARD'] })
      vm.openSaveAsRole()
      vm.saveAsRoleForm.code = 'custom_chen'
      vm.saveAsRoleForm.label = '陳主任專用'
      await vm.submitSaveAsRole()
      await flushPromises()
      expect(vi.mocked(createRole)).toHaveBeenCalledWith({ code: 'custom_chen', label: '陳主任專用', permissions: ['DASHBOARD'] })
      expect(vi.mocked(updateUser)).toHaveBeenCalledWith(3, { role: 'custom_chen' })
    })

    it('另存中間態：createRole 成功、updateUser 失敗 → 錯誤訊息含「已建立」且 refetch 定義', async () => {
      vi.mocked(updateUser).mockRejectedValueOnce(new Error('boom'))
      const errorSpy = vi.spyOn(ElMessage, 'error')
      const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
      await flushPromises()
      const vm = wrapper.vm as unknown as {
        handleEditUser: (u: Record<string, unknown>) => void
        openSaveAsRole: () => void
        saveAsRoleForm: { code: string; label: string }
        submitSaveAsRole: () => Promise<void>
      }
      vm.handleEditUser({ id: 3, username: 'chen03', role: 'supervisor', permission_names: ['DASHBOARD'] })
      vm.openSaveAsRole()
      vm.saveAsRoleForm.code = 'custom_chen'
      vm.saveAsRoleForm.label = '陳主任專用'
      await vm.submitSaveAsRole()
      await flushPromises()
      expect(errorSpy.mock.calls.some((c) => String(c[0]).includes('已建立'))).toBe(true)
      errorSpy.mockRestore()
    })
  })
})
