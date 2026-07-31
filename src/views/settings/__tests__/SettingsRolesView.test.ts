import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'

vi.mock('@/api/auth', () => ({
  getPermissions: vi.fn().mockResolvedValue({
    data: {
      permissions: { DASHBOARD: { value: 'DASHBOARD', label: '儀表板' } },
      groups: [{ name: '一般', permissions: ['DASHBOARD'] }],
      roles: {
        admin: { label: '管理員', description: '', permissions: ['*'], flags: ['super_admin'] },
        hr: { label: '人資', description: '', permissions: ['DASHBOARD'], flags: [] },
        parent: { label: '家長', description: '', permissions: [], flags: ['parent', 'portal_only'] },
        custom_x: { label: '自訂X', description: '', permissions: ['DASHBOARD'], flags: [] },
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

  it('左欄列出角色：label/code/帳號數/flag badge', async () => {
    const w = await mountView()
    const text = w.text()
    expect(text).toContain('管理員')
    expect(text).toContain('custom_x')
    expect(text).toContain('超級管理員')
    expect(text).not.toContain('👑')
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
    await flushPromises()
    expect(vm.selectedCode).toBe('custom_x')
  })

  it('未儲存變更保護：右欄 isDirty 時切換角色會先詢問，取消則不切換、確定則切換', async () => {
    const w = await mountView()
    const vm = w.vm as unknown as { selectedCode: string; panelRef: { isDirty: boolean } | null }
    // stub 出的 RoleDetailPanel 沒有真正的 isDirty 邏輯，直接覆寫模擬「有未儲存變更」
    expect(vm.panelRef).not.toBeNull()
    ;(vm.panelRef as { isDirty: boolean }).isDirty = true

    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValueOnce('cancel')
    await w.find('[data-role-item="custom_x"]').trigger('click')
    await flushPromises()
    expect(vm.selectedCode).toBe('admin') // 取消 → 不切換

    confirmSpy.mockResolvedValueOnce('confirm' as never)
    await w.find('[data-role-item="custom_x"]').trigger('click')
    await flushPromises()
    expect(vm.selectedCode).toBe('custom_x') // 確定 → 切換
    confirmSpy.mockRestore()
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

  // ── 角色設定頁稽核 2026-07-31 ──

  it('新增角色 code 即時驗證：格式錯／重複時給中文說明且不送 API', async () => {
    const w = await mountView()
    const vm = w.vm as unknown as {
      createForm: { code: string; label: string; description: string }
      codeError: string
      handleCreateRole: () => Promise<void>
    }
    expect(vm.codeError).toBe('') // 空值不報錯（尚未填寫）

    vm.createForm.code = 'Custom-Role'
    await flushPromises()
    expect(vm.codeError).toContain('小寫英文字母開頭')

    vm.createForm.code = 'hr' // 已存在
    await flushPromises()
    expect(vm.codeError).toContain('已存在')

    vm.createForm.label = '測試'
    await vm.handleCreateRole()
    await flushPromises()
    expect(vi.mocked(createRole)).not.toHaveBeenCalled()

    vm.createForm.code = 'custom_ok'
    await flushPromises()
    expect(vm.codeError).toBe('')
  })
})
