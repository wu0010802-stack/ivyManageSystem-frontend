import { describe, it, expect, vi, beforeEach } from 'vitest'

// 本檔全部整棵 mount（ElementPlus + attachTo）、單機 8GB 下單測可逼近 5s 預設上限，
// 放寬到 10s 避免慢機 false negative（非個別測試異常）
vi.setConfig({ testTimeout: 10_000 })
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
      admin: { label: '系統管理員', description: '唯一能改帳號、系統設定', permissions: ['*'], flags: ['super_admin'] },
      principal: { label: '園長', description: '業務全包 + 薪資審視，不動帳號', permissions: ['DASHBOARD', 'EMPLOYEES_READ', 'SALARY_READ'], flags: [] },
      supervisor: { label: '主管', description: '教務管理、招生轉換、考核全程', permissions: ['DASHBOARD', 'EMPLOYEES_READ'], flags: [] },
      hr: { label: '人事管理員', description: '員工資料、薪資發放、年終、廠商付款', permissions: ['DASHBOARD', 'EMPLOYEES_READ', 'EMPLOYEES_WRITE', 'SALARY_READ', 'SALARY_WRITE'], flags: [] },
      accountant: { label: '會計', description: '純財務（薪資/學費/廠商/年終）', permissions: ['DASHBOARD', 'EMPLOYEES_READ', 'SALARY_READ', 'SALARY_WRITE'], flags: [] },
      teacher: { label: '教師', description: '公告、考勤、放學接送、學生檔案', permissions: ['DASHBOARD'], flags: ['portal_only'] },
      parent: { label: '家長', description: '家長端登入，無管理端權限', permissions: [], flags: ['parent', 'portal_only'] },
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
const push = vi.fn()
let mockQuery: Record<string, unknown> = {}
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: mockQuery }),
  useRouter: () => ({ replace, push }),
}))

// hasPermission 預設回 true（既有測試多假設「管理角色」按鈕無條件顯示）；
// 保留其餘原始匯出（isSuperAdmin / permissionsHave 等集合運算），避免其他測試間接依賴的匯出消失。
const mockHasPermission = vi.fn().mockReturnValue(true)
// getUserInfo 供 isSelf（自己的帳號不可停用/刪除）判斷；預設操作者不在 mock 名單內
const mockGetUserInfo = vi.fn()
vi.mock('@/utils/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/auth')>()
  return {
    ...actual,
    hasPermission: (name: string) => mockHasPermission(name),
    getUserInfo: () => mockGetUserInfo(),
  }
})

import SettingsAccountsTab from '../SettingsAccountsTab.vue'
import { createUser, updateUser, getUsers } from '@/api/auth'
import { createRole } from '@/api/permissions_admin'
import { formatDateTimeTW } from '@/utils/format'

describe('SettingsAccountsTab — role card UX', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery = {}
    replace.mockClear()
    push.mockClear()
    mockHasPermission.mockReturnValue(true)
    mockGetUserInfo.mockReturnValue({ username: 'operator', role: 'admin' })
  })

  it('管理角色按鈕：有 ROLES_MANAGE 才顯示，點擊導向 /settings/roles', async () => {
    mockHasPermission.mockImplementation((name: string) => name === 'ROLES_MANAGE')
    const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
    await flushPromises()
    const btn = wrapper.find('[data-testid="goto-roles"]')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    expect(push).toHaveBeenCalledWith('/settings/roles')
  })

  it('無 ROLES_MANAGE 權限時不顯示「管理角色」按鈕', async () => {
    mockHasPermission.mockReturnValue(false)
    const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(wrapper.find('[data-testid="goto-roles"]').exists()).toBe(false)
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
    // 用元件實際採用的 formatDateTimeTW 計算期望值，避免 offset-less ISO
    // （'2026-07-10T17:35:14.324936' 無時區後綴）在不同 runner 時區下
    // 因跨日而寫死的日期字串斷言失準。
    expect(text).toContain(formatDateTimeTW('2026-07-10T17:35:14.324936'))
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

    it('saveEditUser：role 有變更時，payload 只有 role、不含 permission_names', async () => {
      const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
      await flushPromises()
      const vm = wrapper.vm as unknown as {
        handleEditUser: (u: Record<string, unknown>) => void
        editUserForm: { role: string }
        saveEditUser: () => Promise<void>
      }
      vm.handleEditUser({ id: 3, username: 'chen03', role: 'supervisor', permission_names: ['DASHBOARD'] })
      vm.editUserForm.role = 'hr' // 使用者在 dialog 內實際切換了角色
      await vm.saveEditUser()
      expect(vi.mocked(updateUser)).toHaveBeenCalledWith(3, { role: 'hr' })
    })

    // final review Critical-1 回歸測試：no-op 儲存（開 dialog 沒改角色）不可送出 { role }，
    // 否則後端會把偏離帳號的自訂 permission_names 靜默重置為角色預設
    it('saveEditUser：role 未變更時不呼叫 API，直接關閉 dialog（防偏離權限被靜默重置）', async () => {
      const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
      await flushPromises()
      const vm = wrapper.vm as unknown as {
        handleEditUser: (u: Record<string, unknown>) => void
        saveEditUser: () => Promise<void>
        editUserDialogVisible: boolean
      }
      vm.handleEditUser({ id: 3, username: 'chen03', role: 'supervisor', permission_names: ['DASHBOARD'] })
      expect(vm.editUserDialogVisible).toBe(true)
      await vm.saveEditUser()
      expect(vi.mocked(updateUser)).not.toHaveBeenCalled()
      expect(vm.editUserDialogVisible).toBe(false)
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

  describe('2026-07-31 帳號設定 UX 修正包', () => {
    it('家長視圖不顯示「新增帳號」與「管理角色」（家長帳號由 LINE 綁定產生）', async () => {
      mockQuery = { view: 'parent' }
      const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
      await flushPromises()
      expect(wrapper.find('.toolbar-right').exists()).toBe(false)
      expect(wrapper.find('[data-testid="goto-roles"]').exists()).toBe(false)
    })

    it('教職員視圖維持顯示工具列右側按鈕', async () => {
      const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
      await flushPromises()
      expect(wrapper.find('.toolbar-right').exists()).toBe(true)
    })

    it('isSelf：只有目前登入者自己的列為 true；未登入資訊時 fail-safe 為 false', async () => {
      mockGetUserInfo.mockReturnValue({ username: 'wang01' })
      const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
      await flushPromises()
      const vm = wrapper.vm as unknown as { isSelf: (row: Record<string, unknown>) => boolean }
      expect(vm.isSelf({ username: 'wang01' })).toBe(true)
      expect(vm.isSelf({ username: 'lin02' })).toBe(false)
      mockGetUserInfo.mockReturnValue(null)
      expect(vm.isSelf({ username: 'wang01' })).toBe(false)
    })

    it('generatePassword 符合後端密碼政策（≥8 字元、含大寫/小寫/數字）', async () => {
      const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
      await flushPromises()
      const vm = wrapper.vm as unknown as { generatePassword: () => string }
      for (let i = 0; i < 20; i++) {
        const pw = vm.generatePassword()
        expect(pw.length).toBeGreaterThanOrEqual(8)
        expect(pw).toMatch(/[A-Z]/)
        expect(pw).toMatch(/[a-z]/)
        expect(pw).toMatch(/\d/)
      }
    })

    it('buildLoginUrl：portal_only 角色（teacher）給 Portal 入口，管理端角色給 /#/login', async () => {
      const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
      await flushPromises()
      const vm = wrapper.vm as unknown as { buildLoginUrl: (role: string) => string }
      expect(vm.buildLoginUrl('teacher')).toBe(`${window.location.origin}/#/portal/login`)
      expect(vm.buildLoginUrl('supervisor')).toBe(`${window.location.origin}/#/login`)
      // 定義未含該角色時 fallback PORTAL_ONLY_ROLES 白名單
      expect(vm.buildLoginUrl('unknown_role')).toBe(`${window.location.origin}/#/login`)
    })

    it('saveUser 成功後 createdCredentials 帶入依角色計算的登入網址', async () => {
      const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
      await flushPromises()
      const vm = wrapper.vm as unknown as {
        userForm: Record<string, unknown>
        saveUser: () => Promise<void>
        createdCredentials: { username: string; password: string; loginUrl: string }
      }
      Object.assign(vm.userForm, { employee_id: 1, username: 'u1', password: 'Abc12345', role: 'teacher' })
      await vm.saveUser()
      await flushPromises()
      expect(vm.createdCredentials.loginUrl).toBe(`${window.location.origin}/#/portal/login`)
    })
  })
})
