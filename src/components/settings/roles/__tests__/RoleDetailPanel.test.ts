import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'

vi.mock('@/api/permissions_admin', () => ({
  updateRole: vi.fn().mockResolvedValue({ data: {} }),
}))

// PermissionPicker 也 import '@/utils/auth' 的集合運算，需保留原始實作只覆寫 isSuperAdmin
const mockIsSuperAdmin = vi.fn().mockReturnValue(true)
vi.mock('@/utils/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/auth')>()
  return { ...actual, isSuperAdmin: () => mockIsSuperAdmin() }
})

import { updateRole } from '@/api/permissions_admin'
import RoleDetailPanel from '../RoleDetailPanel.vue'
import type { RolesDefinition } from '../types'

const definition: RolesDefinition = {
  permissions: { DASHBOARD: { value: 'DASHBOARD', label: '儀表板' } },
  groups: [{ name: '一般', permissions: ['DASHBOARD'] }],
  roles: {
    admin: { label: '管理員', description: '', permissions: ['*'], is_core: true, flags: ['super_admin'] },
    hr: { label: '人資', description: '', permissions: ['DASHBOARD'], is_core: true, flags: [] },
    parent: { label: '家長', description: '', permissions: [], is_core: true, flags: ['parent', 'portal_only'] },
    custom_x: { label: '自訂X', description: '', permissions: ['DASHBOARD'], is_core: false, flags: [] },
  },
}

const mountPanel = (code: string, accountCount: number | null = 0) =>
  mount(RoleDetailPanel, {
    props: { code, role: definition.roles[code], definition, accountCount },
    global: { plugins: [ElementPlus] },
  })

describe('RoleDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsSuperAdmin.mockReturnValue(true)
  })

  it('非 super_admin：超級管理員 checkbox disabled', () => {
    mockIsSuperAdmin.mockReturnValue(false)
    const w = mountPanel('custom_x')
    const vm = w.vm as unknown as { superAdminDisabled: boolean; superAdminTooltip: string }
    expect(vm.superAdminDisabled).toBe(true)
    expect(vm.superAdminTooltip).toContain('僅超級管理員')
  })

  it('核心 admin：超級管理員 checkbox disabled（不可移除）', () => {
    const w = mountPanel('admin')
    const vm = w.vm as unknown as { superAdminDisabled: boolean; superAdminTooltip: string }
    expect(vm.superAdminDisabled).toBe(true)
    expect(vm.superAdminTooltip).toContain('不可移除')
  })

  it('家長 checkbox：帳號數 > 0 且未勾 → disabled；帳號數 null（無 USER_MANAGEMENT_READ）→ 不擋', () => {
    const withAccounts = mountPanel('custom_x', 3)
    expect((withAccounts.vm as unknown as { parentDisabled: boolean }).parentDisabled).toBe(true)
    const unknownCount = mountPanel('custom_x', null)
    expect((unknownCount.vm as unknown as { parentDisabled: boolean }).parentDisabled).toBe(false)
  })

  it('核心 parent：家長 checkbox disabled（不可移除）', () => {
    const w = mountPanel('parent')
    expect((w.vm as unknown as { parentDisabled: boolean }).parentDisabled).toBe(true)
  })

  it('儲存：confirm（含帳號數文案）→ updateRole payload 含 flags 且保留 portal_only；核心角色不送 permissions', async () => {
    const w = mountPanel('parent', 5)
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    await (w.vm as unknown as { handleSave: () => Promise<void> }).handleSave()
    await flushPromises()
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('5 個帳號'), expect.any(String), expect.any(Object))
    const payload = vi.mocked(updateRole).mock.calls[0][1] as { flags?: string[]; permissions?: string[] }
    expect(payload.flags).toContain('portal_only')
    expect(payload.flags).toContain('parent')
    expect(payload.permissions).toBeUndefined()
    confirmSpy.mockRestore()
  })

  it('儲存 confirm 取消 → 不送 API', async () => {
    const w = mountPanel('custom_x')
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
    await (w.vm as unknown as { handleSave: () => Promise<void> }).handleSave()
    expect(vi.mocked(updateRole)).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('自訂角色儲存：payload 含 permissions；成功 emit saved', async () => {
    const w = mountPanel('custom_x')
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    await (w.vm as unknown as { handleSave: () => Promise<void> }).handleSave()
    await flushPromises()
    const payload = vi.mocked(updateRole).mock.calls[0][1] as { permissions?: string[] }
    expect(payload.permissions).toEqual(['DASHBOARD'])
    expect(w.emitted('saved')).toBeTruthy()
    confirmSpy.mockRestore()
  })

  it('刪除保護：核心角色 deleteDisabled；自訂＋帳號數>0 也 disabled；自訂＋0 帳號可按並 emit', async () => {
    expect((mountPanel('hr').vm as unknown as { deleteDisabled: boolean }).deleteDisabled).toBe(true)
    expect((mountPanel('custom_x', 2).vm as unknown as { deleteDisabled: boolean }).deleteDisabled).toBe(true)
    const w = mountPanel('custom_x', 0)
    expect((w.vm as unknown as { deleteDisabled: boolean }).deleteDisabled).toBe(false)
    ;(w.vm as unknown as { requestDelete: () => void }).requestDelete()
    expect(w.emitted('delete-role')).toBeTruthy()
  })

  it('切換角色（props.code 變更）→ 表單重置為新角色資料', async () => {
    const w = mountPanel('custom_x')
    const vm = w.vm as unknown as { form: { label: string } }
    vm.form.label = '改過的名稱'
    await w.setProps({ code: 'hr', role: definition.roles.hr, accountCount: 0 })
    expect(vm.form.label).toBe('人資')
  })
})
