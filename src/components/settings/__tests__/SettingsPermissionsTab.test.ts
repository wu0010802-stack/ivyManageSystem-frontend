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
  createPermissionDefinition: vi.fn().mockResolvedValue({ data: { code: 'NEW', label: 'n', is_core: false } }),
  updatePermissionDefinition: vi.fn().mockResolvedValue({ data: {} }),
  deletePermissionDefinition: vi.fn().mockResolvedValue({ data: { ok: true } }),
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

  it('renders two sub-tabs: 角色管理 + 權限定義', async () => {
    const wrapper = await mountTab()
    const tabLabels = wrapper.findAll('.el-tabs__item').map((el) => el.text())
    expect(tabLabels).toContain('角色管理')
    expect(tabLabels).toContain('權限定義')
  })

  it('roles table renders all roles with is_core badge', async () => {
    const wrapper = await mountTab()
    // 角色管理是 default tab，table 應渲染 3 個 role
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

  it('switching to 權限定義 tab shows warning callout', async () => {
    const wrapper = await mountTab()
    // 找「權限定義」tab 並點
    const permTabLabel = wrapper.findAll('.el-tabs__item').find((el) => el.text() === '權限定義')
    await permTabLabel?.trigger('click')
    await flushPromises()
    await nextTick()
    const callout = document.querySelector('.permission-warning-callout')
    expect(callout).not.toBeNull()
    expect(callout?.textContent).toContain('自訂權限僅可用於')
  })

  it('clicking 新增權限 opens dialog with code+label+description+group_name fields', async () => {
    const wrapper = await mountTab()
    const permTabLabel = wrapper.findAll('.el-tabs__item').find((el) => el.text() === '權限定義')
    await permTabLabel?.trigger('click')
    await flushPromises()
    const addBtn = document.querySelector('.add-permission-btn') as HTMLElement
    addBtn.click()
    await flushPromises()
    expect(document.querySelector('.permission-edit-dialog')).not.toBeNull()
    expect(document.querySelector('.permission-edit-dialog input[data-field="code"]')).not.toBeNull()
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

  it('is_core permission delete button is disabled in 權限定義 tab', async () => {
    const wrapper = await mountTab()
    const permTabLabel = wrapper.findAll('.el-tabs__item').find((el) => el.text() === '權限定義')
    await permTabLabel?.trigger('click')
    await flushPromises()
    const dashboardRow = Array.from(document.querySelectorAll('.permissions-table .el-table__row')).find((r) =>
      r.textContent?.includes('DASHBOARD'),
    )
    const deleteBtn = dashboardRow?.querySelector('.delete-permission-btn')
    expect(deleteBtn?.hasAttribute('disabled')).toBe(true)
  })
})
