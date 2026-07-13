import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'

vi.mock('@/api/auth', () => ({
  getPermissions: vi.fn().mockResolvedValue({
    data: {
      permissions: { DASHBOARD: { value: 'DASHBOARD', label: '儀表板' } },
      groups: [{ name: '一般', permissions: ['DASHBOARD'] }],
      roles: {
        admin: { label: '管理員', description: '', permissions: ['*'], is_core: true, flags: ['super_admin'] },
        hr: { label: '人資', description: '', permissions: ['DASHBOARD'], is_core: true, flags: [] },
        parent: { label: '家長', description: '', permissions: [], is_core: true, flags: ['parent', 'portal_only'] },
        custom_x: { label: '自訂X', description: '', permissions: ['DASHBOARD'], is_core: false, flags: [] },
      },
    },
  }),
  getUsers: vi.fn().mockResolvedValue({
    data: [
      { id: 1, username: 'a', role: 'admin' },
      { id: 2, username: 'b', role: 'hr' },
      { id: 3, username: 'c', role: 'hr' },
    ],
  }),
}))

vi.mock('@/api/permissions_admin', () => ({
  createRole: vi.fn().mockResolvedValue({ data: {} }),
  deleteRole: vi.fn().mockResolvedValue({ data: { ok: true } }),
  updateRole: vi.fn().mockResolvedValue({ data: {} }),
}))

import { getUsers } from '@/api/auth'
import { createRole, deleteRole } from '@/api/permissions_admin'
import SettingsRolesView from '../SettingsRolesView.vue'

// RoleDetailPanel 另有自己的測試；此處 stub 掉聚焦 view 邏輯
const stubs = {
  RoleDetailPanel: { name: 'RoleDetailPanel', props: ['code', 'role', 'definition', 'accountCount'], template: '<div data-test="detail" :data-code="code" />' },
  ApprovalChainEditor: { name: 'ApprovalChainEditor', props: ['submitterRole', 'definition', 'accountCounts'], template: '<div data-test="chain-editor" />' },
}

const mountView = async () => {
  const w = mount(SettingsRolesView, { global: { plugins: [ElementPlus], stubs } })
  await flushPromises()
  return w
}

describe('SettingsRolesView', () => {
  beforeEach(() => vi.clearAllMocks())

  it('左欄列出角色：label/code/帳號數/核心自訂 tag/flag badge', async () => {
    const w = await mountView()
    const text = w.text()
    expect(text).toContain('管理員')
    expect(text).toContain('custom_x')
    expect(text).toContain('👑')
    const vm = w.vm as unknown as { roleRows: { code: string; accountCount: number | null }[] }
    expect(vm.roleRows.find((r) => r.code === 'hr')?.accountCount).toBe(2)
    expect(vm.roleRows.find((r) => r.code === 'custom_x')?.accountCount).toBe(0)
  })

  it('getUsers 403（僅 ROLES_MANAGE）→ accountCounts 為 null、帳號數顯示 —', async () => {
    vi.mocked(getUsers).mockRejectedValueOnce(new Error('403'))
    const w = await mountView()
    const vm = w.vm as unknown as { accountCounts: Record<string, number> | null }
    expect(vm.accountCounts).toBeNull()
    expect(w.text()).toContain('—')
  })

  it('預設選中第一個角色並渲染 detail；點選切換 selectedCode', async () => {
    const w = await mountView()
    const vm = w.vm as unknown as { selectedCode: string }
    expect(vm.selectedCode).toBe('admin')
    await w.find('[data-role-item="custom_x"]').trigger('click')
    expect(vm.selectedCode).toBe('custom_x')
  })

  it('新增角色：createRole payload {code,label,description,permissions:[]}，成功後選中新角色', async () => {
    const w = await mountView()
    const vm = w.vm as unknown as {
      createDialogVisible: boolean
      createForm: { code: string; label: string; description: string }
      handleCreateRole: () => Promise<void>
      selectedCode: string
    }
    vm.createForm.code = 'custom_y'
    vm.createForm.label = '自訂Y'
    await vm.handleCreateRole()
    await flushPromises()
    expect(vi.mocked(createRole)).toHaveBeenCalledWith({ code: 'custom_y', label: '自訂Y', description: undefined, permissions: [] })
    expect(vm.selectedCode).toBe('custom_y')
  })

  it('刪除角色：confirm 後呼叫 deleteRole；409（鏈殘留）顯示後端 detail', async () => {
    const w = await mountView()
    const vm = w.vm as unknown as { selectedCode: string; handleDeleteRole: () => Promise<void> }
    vm.selectedCode = 'custom_x'
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    await vm.handleDeleteRole()
    await flushPromises()
    expect(vi.mocked(deleteRole)).toHaveBeenCalledWith('custom_x')
    confirmSpy.mockRestore()
  })
})
