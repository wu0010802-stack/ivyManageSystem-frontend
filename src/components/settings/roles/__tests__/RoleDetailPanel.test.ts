import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'

vi.mock('@/api/permissions_admin', () => ({
  updateRole: vi.fn().mockResolvedValue({ data: {} }),
}))

// RoleDetailPanel 內嵌 ApprovalChainEditor，掛載時會呼叫此 API
vi.mock('@/api/approvalSettings', () => ({
  getApprovalPolicies: vi.fn().mockResolvedValue({ data: [] }),
  updateApprovalPolicies: vi.fn().mockResolvedValue({ data: {} }),
}))

// vuedraggable stub（同 ApprovalChainEditor.test.ts）：拖拉重排非本檔測試重點
vi.mock('vuedraggable', () => ({
  default: {
    name: 'draggable',
    props: ['modelValue', 'itemKey', 'handle', 'disabled'],
    emits: ['update:modelValue'],
    template: `<div data-test="draggable"><template v-for="(el, i) in modelValue" :key="el.uid"><slot name="item" :element="el" :index="i" /></template></div>`,
  },
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
    admin: { label: '管理員', description: '', permissions: ['*'], flags: ['super_admin'] },
    hr: { label: '人資', description: '', permissions: ['DASHBOARD'], flags: [] },
    parent: { label: '家長', description: '', permissions: [], flags: ['parent', 'portal_only'] },
    custom_x: { label: '自訂X', description: '', permissions: ['DASHBOARD'], flags: [] },
  },
}

const mountPanel = (
  code: string,
  accountCount: number | null = 0,
  accountCounts: Record<string, number> | null = null,
) =>
  mount(RoleDetailPanel, {
    props: { code, role: definition.roles[code], definition, accountCount, accountCounts },
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

  it('儲存：confirm（含帳號數文案）→ updateRole payload 含 flags 且保留 portal_only；一律送 permissions', async () => {
    const w = mountPanel('parent', 5)
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    await (w.vm as unknown as { handleSave: () => Promise<void> }).handleSave()
    await flushPromises()
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('5 個帳號'), expect.any(String), expect.any(Object))
    const payload = vi.mocked(updateRole).mock.calls[0][1] as { flags?: string[]; permissions?: string[] }
    expect(payload.flags).toContain('portal_only')
    expect(payload.flags).toContain('parent')
    expect(payload.permissions).toEqual([])
    confirmSpy.mockRestore()
  })

  it('儲存 confirm 取消 → 不送 API', async () => {
    const w = mountPanel('custom_x')
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
    await (w.vm as unknown as { handleSave: () => Promise<void> }).handleSave()
    expect(vi.mocked(updateRole)).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('儲存：payload 含 permissions；成功 emit saved', async () => {
    const w = mountPanel('custom_x')
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    await (w.vm as unknown as { handleSave: () => Promise<void> }).handleSave()
    await flushPromises()
    const payload = vi.mocked(updateRole).mock.calls[0][1] as { permissions?: string[] }
    expect(payload.permissions).toEqual(['DASHBOARD'])
    expect(w.emitted('saved')).toBeTruthy()
    confirmSpy.mockRestore()
  })

  it('isDirty：改動表單後為 true；儲存成功後回 false；切換角色重置為 false', async () => {
    const w = mountPanel('custom_x')
    const vm = w.vm as unknown as { form: { label: string; permissions: string[] }; isDirty: boolean; handleSave: () => Promise<void> }
    expect(vm.isDirty).toBe(false)
    vm.form.label = '改過的名稱'
    expect(vm.isDirty).toBe(true)
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    await vm.handleSave()
    await flushPromises()
    expect(vm.isDirty).toBe(false)
    confirmSpy.mockRestore()

    vm.form.permissions = [...vm.form.permissions, 'EXTRA_PERM']
    expect(vm.isDirty).toBe(true)
    await w.setProps({ code: 'hr', role: definition.roles.hr, accountCount: 0 })
    expect(vm.isDirty).toBe(false)
  })

  it('刪除保護：帳號數>0 disabled（系統預設與自訂角色同規則）；0 帳號可按並 emit', async () => {
    // 逐個掛載後即 unmount：本檔每次 mount 都會連帶建起 PermissionPicker 與
    // ApprovalChainEditor 兩棵樹，四棵同時留著會讓這個純 computed 斷言的測試逼近
    // 預設 5s timeout（2026-07-31 曾因此偶發紅）。
    const expectDeleteDisabled = (code: string, count: number, expected: boolean) => {
      const w = mountPanel(code, count)
      expect((w.vm as unknown as { deleteDisabled: boolean }).deleteDisabled).toBe(expected)
      w.unmount()
    }
    expectDeleteDisabled('hr', 3, true)
    expectDeleteDisabled('custom_x', 2, true)
    expectDeleteDisabled('hr', 0, false)
    const w = mountPanel('custom_x', 0)
    expect((w.vm as unknown as { deleteDisabled: boolean }).deleteDisabled).toBe(false)
    ;(w.vm as unknown as { requestDelete: () => void }).requestDelete()
    expect(w.emitted('delete-role')).toBeTruthy()
  })

  // ── 角色設定頁稽核 2026-07-31 的回歸防線 ──

  it('wildcard 角色：權限樹不渲染、儲存仍送 ["*"]（不塌縮成顯式清單）', async () => {
    const w = mountPanel('admin', 1)
    const vm = w.vm as unknown as { isWildcardRole: boolean; form: { permissions: string[] } }
    expect(vm.isWildcardRole).toBe(true)
    // 未展開前不給操作權限樹，避免動一格就把 wildcard 換成當下碼的快照
    expect(w.find('[data-testid="wildcard-notice"]').exists()).toBe(true)
    expect(w.find('.permission-picker').exists()).toBe(false)

    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    await (w.vm as unknown as { handleSave: () => Promise<void> }).handleSave()
    await flushPromises()
    const payload = vi.mocked(updateRole).mock.calls[0][1] as { permissions?: string[] }
    expect(payload.permissions).toEqual(['*'])
    confirmSpy.mockRestore()
  })

  it('wildcard 角色：明確按下「改為逐項設定」才展開成顯式清單', async () => {
    const w = mountPanel('admin', 1)
    const vm = w.vm as unknown as {
      expandWildcard: () => Promise<void>
      form: { permissions: string[] }
      isWildcardRole: boolean
    }
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    await vm.expandWildcard()
    await flushPromises()
    expect(vm.isWildcardRole).toBe(false)
    expect(vm.form.permissions).toEqual(Object.keys(definition.permissions))
    expect(w.find('.permission-picker').exists()).toBe(true)
    confirmSpy.mockRestore()
  })

  it('家長身份角色：權限樹唯讀並顯示說明（後端不驗語意，避免誘導出無效設定）', () => {
    const w = mountPanel('parent', 0)
    const vm = w.vm as unknown as { isParentRole: boolean; permissionsReadonly: boolean }
    expect(vm.isParentRole).toBe(true)
    expect(vm.permissionsReadonly).toBe(true)
    expect(w.find('[data-testid="parent-role-notice"]').exists()).toBe(true)
  })

  it('isDirty 併入簽呈關卡草稿：關卡改了沒存也算未儲存變更', async () => {
    const w = mountPanel('custom_x', 0)
    const vm = w.vm as unknown as {
      isDirty: boolean
      activeTab: string
      chainRef: { chainDraft: { uid: number; role: string }[] } | null
    }
    expect(vm.isDirty).toBe(false)
    // el-tab-pane 懶掛載：先切到簽呈關卡分頁，ApprovalChainEditor 才會建起來
    vm.activeTab = 'chain'
    await flushPromises()
    // 直接改關卡草稿（等同使用者加了一個關卡卻沒按「儲存關卡鏈」）
    vm.chainRef!.chainDraft.push({ uid: 999, role: 'hr' })
    await flushPromises()
    expect(vm.isDirty).toBe(true)
  })

  it('切換角色（props.code 變更）→ 表單重置為新角色資料', async () => {
    const w = mountPanel('custom_x')
    const vm = w.vm as unknown as { form: { label: string } }
    vm.form.label = '改過的名稱'
    await w.setProps({ code: 'hr', role: definition.roles.hr, accountCount: 0 })
    expect(vm.form.label).toBe('人資')
  })
})
