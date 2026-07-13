import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus, { ElMessageBox } from 'element-plus'

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
      admin: { label: '系統管理員', description: '唯一能改帳號、系統設定', permissions: ['*'], is_core: true },
      principal: { label: '園長', description: '業務全包 + 薪資審視，不動帳號', permissions: ['DASHBOARD', 'EMPLOYEES_READ', 'SALARY_READ'], is_core: true },
      supervisor: { label: '主管', description: '教務管理、招生轉換、考核全程', permissions: ['DASHBOARD', 'EMPLOYEES_READ'], is_core: true },
      hr: { label: '人事管理員', description: '員工資料、薪資發放、年終、廠商付款', permissions: ['DASHBOARD', 'EMPLOYEES_READ', 'EMPLOYEES_WRITE', 'SALARY_READ', 'SALARY_WRITE'], is_core: true },
      accountant: { label: '會計', description: '純財務（薪資/學費/廠商/年終）', permissions: ['DASHBOARD', 'EMPLOYEES_READ', 'SALARY_READ', 'SALARY_WRITE'], is_core: true },
      teacher: { label: '教師', description: '公告、考勤、放學接送、學生檔案', permissions: ['DASHBOARD'], is_core: true },
      parent: { label: '家長', description: '家長端登入，無管理端權限', permissions: [], is_core: true },
    },
  }
  return {
    getUsers: vi.fn().mockResolvedValue({
      data: [
        { id: 1, username: 'wang01', employee_name: '王小明', role: 'admin', permission_names: ['*'], is_active: true, last_login: '2026-07-10T17:35:14.324936' },
        { id: 2, username: 'lin02', employee_name: '林老師', role: 'teacher', permission_names: null, is_active: true, last_login: null },
        { id: 3, username: 'chen03', employee_name: '陳主任', role: 'supervisor', permission_names: ['DASHBOARD', 'EMPLOYEES_READ'], is_active: true, last_login: null },
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

import SettingsAccountsTab from '../SettingsAccountsTab.vue'
import { createUser, updateUser } from '@/api/auth'
import { formatDateTimeTW } from '@/utils/format'

describe('SettingsAccountsTab — role card UX', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  it('renders 7 role cards in new-user dialog', async () => {
    await mountAndOpenAddDialog()
    const cards = document.querySelectorAll('.role-card')
    expect(cards.length).toBe(7)
    const roleKeys = Array.from(cards).map((el) => el.getAttribute('data-role'))
    expect(roleKeys.sort()).toEqual(['accountant', 'admin', 'hr', 'parent', 'principal', 'supervisor', 'teacher'])
  })

  it('clicking principal card fills form with role template and collapses expander', async () => {
    await mountAndOpenAddDialog()
    const principalCard = document.querySelector('.role-card[data-role="principal"]') as HTMLElement
    principalCard.click()
    await flushPromises()
    await nextTick()
    // expander collapsed（v-show 控制）
    const expanderContent = document.querySelector('.advanced-tuning-content')
    expect(expanderContent === null || (expanderContent as HTMLElement).style.display === 'none').toBe(true)
    // badge 顯示「預設」
    const badge = document.querySelector('.deviation-badge')
    expect(badge?.textContent).toContain('預設')
  })

  it('進階微調偏離後 watch 自動展開 expander 且 badge 顯示已偏離', async () => {
    const wrapper = await mountAndOpenAddDialog()
    // 先選 principal 套用預設（deviationCount=0, expander=collapsed）
    ;(document.querySelector('.role-card[data-role="principal"]') as HTMLElement).click()
    await flushPromises()
    await nextTick()
    const expanderContent = document.querySelector('.advanced-tuning-content') as HTMLElement
    expect(expanderContent?.style.display).toBe('none')
    // 直接改 permission_names 製造偏離（PermissionPicker 接管後由 vm 操作）
    const vm = wrapper.vm as unknown as { userForm: { role: string; permission_names: string[] } }
    // principal 預設 = ['DASHBOARD', 'EMPLOYEES_READ', 'SALARY_READ']，移除兩個 → 偏離 2 項
    vm.userForm.permission_names = ['DASHBOARD']
    await nextTick()
    // watch(deviationCount, n => if n>0 advancedExpanded=true) 觸發，expander 自動展開
    expect(expanderContent?.style.display).not.toBe('none')
    // badge 顯示「已偏離」
    const badge = document.querySelector('.deviation-badge')
    expect(badge?.textContent).toContain('已偏離')
    // 還原預設 button 出現
    expect(document.querySelector('.restore-default-btn')).not.toBeNull()
  })

  it('clicking 還原預設 resets to role template', async () => {
    const wrapper = await mountAndOpenAddDialog()
    ;(document.querySelector('.role-card[data-role="principal"]') as HTMLElement).click()
    await flushPromises()
    await nextTick()
    // 製造偏離
    const vm = wrapper.vm as unknown as { userForm: { role: string; permission_names: string[] } }
    vm.userForm.permission_names = ['DASHBOARD']
    await nextTick()
    // 點還原
    const restoreBtn = document.querySelector('.restore-default-btn') as HTMLElement
    restoreBtn.click()
    await flushPromises()
    await nextTick()
    const badge = document.querySelector('.deviation-badge')
    expect(badge?.textContent).toContain('預設')
    expect(document.querySelector('.restore-default-btn')).toBeNull()
  })

  it('parent role card is disabled with tooltip', async () => {
    await mountAndOpenAddDialog()
    const parentCard = document.querySelector('.role-card[data-role="parent"]')
    expect(parentCard?.classList.contains('is-disabled')).toBe(true)
    expect(parentCard?.getAttribute('title') || parentCard?.querySelector('[role="tooltip"]')?.textContent).toContain('家長端 LIFF')
  })

  it('accounts-toolbar 有「管理角色」按鈕', async () => {
    const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
    await flushPromises()
    const header = wrapper.find('.accounts-toolbar')
    expect(header.text()).toContain('管理角色')
  })

  it('帳號進階微調勾 scope-aware 權限後判為偏離，還原預設歸零', async () => {
    // 沿用 mountTab()（開啟新增帳號 dialog，使 _activeForm 非空）
    const wrapper = await mountTab()
    const vm = wrapper.vm as unknown as {
      userForm: { role: string; permission_names: string[] }
      deviationCount: number
      restoreDefault: (f: { role: string; permission_names: string[] }) => void
      isUsingDefaultPermissions: (f: { role: string; permission_names: string[] }) => boolean
    }
    vm.userForm.role = 'supervisor'
    vm.userForm.permission_names = ['STUDENTS_READ:own_class']  // 與 supervisor 預設不同
    await nextTick()
    expect(vm.deviationCount).toBeGreaterThan(0)
    vm.restoreDefault(vm.userForm)
    await nextTick()
    expect(vm.isUsingDefaultPermissions(vm.userForm)).toBe(true)
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
    expect(text).toContain(formatDateTimeTW('2026-07-10T17:35:14.324936'))  // formatDateTimeTW 輸出（時區無關斷言）
    expect(text).not.toContain('T17:35')      // 原始 ISO 不再直出
    expect(text).toContain('從未登入')
  })

  it('accountCardColumns 最後登入 formatter：null → 從未登入、ISO → formatDateTimeTW', async () => {
    const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
    await flushPromises()
    const vm = wrapper.vm as unknown as {
      accountCardColumns: { prop: string; formatter?: (i: Record<string, unknown>) => unknown }[]
    }
    const col = vm.accountCardColumns.find((c) => c.prop === 'last_login')
    expect(col?.formatter?.({ last_login: null })).toBe('從未登入')
    expect(col?.formatter?.({ last_login: '2026-07-10T17:35:14.324936' })).toBe(formatDateTimeTW('2026-07-10T17:35:14.324936'))
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
})
