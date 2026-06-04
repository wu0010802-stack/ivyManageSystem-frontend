import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'

vi.mock('@/api/auth', () => {
  const mockPermissionDefinition = {
    permissions: {
      DASHBOARD: { value: 'DASHBOARD', label: '儀表板', is_core: true },
      EMPLOYEES_READ: { value: 'EMPLOYEES_READ', label: '員工檢視', is_core: true },
      EMPLOYEES_WRITE: { value: 'EMPLOYEES_WRITE', label: '員工編輯', is_core: true },
      ROLES_MANAGE: { value: 'ROLES_MANAGE', label: '角色與權限管理', is_core: true },
      CUSTOM_X: { value: 'CUSTOM_X', label: '自訂 X', is_core: false },
    },
    groups: [
      { name: '基礎', permissions: ['DASHBOARD', 'ROLES_MANAGE'], split_permissions: [] },
      { name: '員工', permissions: [], split_permissions: [{ module: '員工', read: 'EMPLOYEES_READ', write: 'EMPLOYEES_WRITE' }] },
      { name: '自訂', permissions: ['CUSTOM_X'], split_permissions: [] },
    ],
    roles: {
      admin: { label: '系統管理員', description: '全部', permissions: ['*'], is_core: true },
      teacher: { label: '教師', description: '基礎', permissions: ['DASHBOARD'], is_core: true },
      custom_pri: { label: '兼會計園長', description: 'p+s', permissions: ['DASHBOARD', 'EMPLOYEES_READ'], is_core: false },
    },
  }
  return {
    getPermissions: vi.fn().mockResolvedValue({ data: mockPermissionDefinition }),
  }
})

vi.mock('@/api/permissions_admin', () => ({
  createRole: vi.fn().mockResolvedValue({ data: { code: 'new_r', label: 'r', permissions: [], is_core: false } }),
  updateRole: vi.fn().mockResolvedValue({ data: {} }),
  deleteRole: vi.fn().mockResolvedValue({ data: { ok: true } }),
}))

import SettingsPermissionsTab from '../SettingsPermissionsTab.vue'
import * as permsAdminApi from '@/api/permissions_admin'

describe('SettingsPermissionsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function mountTab() {
    const wrapper = mount(SettingsPermissionsTab, {
      attachTo: document.body,
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    await nextTick()
    return wrapper
  }

  it('已簡化：移除「權限定義」分頁，只保留角色管理', async () => {
    const wrapper = await mountTab()
    // 壓平後不再有內層 sub-tabs
    expect(wrapper.findAll('.el-tabs__item').length).toBe(0)
    // 角色管理入口仍在
    expect(document.querySelector('.add-role-btn')).not.toBeNull()
    // 權限定義相關 UI 全數移除
    expect(document.querySelector('.add-permission-btn')).toBeNull()
    expect(document.querySelector('.permissions-table')).toBeNull()
    expect(document.querySelector('.permission-warning-callout')).toBeNull()
    expect(wrapper.text()).not.toContain('權限定義')
  })

  it('roles table renders all roles with is_core badge', async () => {
    const wrapper = await mountTab()
    // 角色管理表格應渲染 3 個 role
    const rows = document.querySelectorAll('.roles-table .el-table__row')
    expect(rows.length).toBe(3)
  })

  it('is_core role delete button is disabled', async () => {
    const wrapper = await mountTab()
    const adminRow = Array.from(document.querySelectorAll('.roles-table .el-table__row')).find((r) =>
      r.textContent?.includes('admin'),
    )
    const deleteBtn = adminRow?.querySelector('.delete-role-btn')
    expect(deleteBtn?.hasAttribute('disabled')).toBe(true)
  })

  it('clicking 新增角色 opens dialog', async () => {
    const wrapper = await mountTab()
    const addBtn = document.querySelector('.add-role-btn') as HTMLElement
    addBtn.click()
    await flushPromises()
    expect(document.querySelector('.role-edit-dialog')).not.toBeNull()
  })

  it('deleting custom role calls deleteRole API', async () => {
    const wrapper = await mountTab()
    const customRow = Array.from(document.querySelectorAll('.roles-table .el-table__row')).find((r) =>
      r.textContent?.includes('custom_pri'),
    )
    const deleteBtn = customRow?.querySelector('.delete-role-btn') as HTMLElement
    deleteBtn.click()
    await flushPromises()
    // 確認 dialog 出現後點確認
    const confirmBtn = document.querySelector('.el-message-box__btns .el-button--primary') as HTMLElement
    confirmBtn?.click()
    await flushPromises()
    expect(permsAdminApi.deleteRole).toHaveBeenCalledWith('custom_pri')
  })
})
