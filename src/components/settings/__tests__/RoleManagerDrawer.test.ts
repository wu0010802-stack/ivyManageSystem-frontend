import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'

const { createRole, updateRole, deleteRole } = vi.hoisted(() => ({
  createRole: vi.fn().mockResolvedValue({ data: {} }),
  updateRole: vi.fn().mockResolvedValue({ data: {} }),
  deleteRole: vi.fn().mockResolvedValue({ data: { ok: true } }),
}))
vi.mock('@/api/permissions_admin', () => ({ createRole, updateRole, deleteRole }))
vi.mock('@/utils/error', () => ({ apiError: vi.fn((_e: unknown, msg: string) => msg) }))

import RoleManagerDrawer from '../RoleManagerDrawer.vue'

const DEFINITION = {
  permissions: {
    STUDENTS_READ: { value: 'STUDENTS_READ', label: '學生 (檢視)', scope_options: ['own_class', 'all'] },
    DASHBOARD: { value: 'DASHBOARD', label: '儀表板', scope_options: null },
  },
  groups: [{ name: '一般', permissions: ['DASHBOARD', 'STUDENTS_READ'], split_permissions: [] }],
  roles: {
    admin: { label: '管理員', description: '全權', permissions: ['*'], is_core: true },
    custom_x: { label: '自訂X', description: '', permissions: ['DASHBOARD'], is_core: false },
  },
}
const USERS = [
  { id: 1, role: 'admin' }, { id: 2, role: 'custom_x' }, { id: 3, role: 'custom_x' },
]

function mountDrawer() {
  return mount(RoleManagerDrawer, {
    attachTo: document.body,
    props: { visible: true, definition: DEFINITION, users: USERS },
    global: { plugins: [ElementPlus] },
  })
}
type Vm = {
  accountCount: (code: string) => number
  handleAddRole: () => void
  handleEditRole: (row: { code: string; label: string; description: string; permissions: string[]; is_core: boolean }) => void
  saveRole: () => Promise<void>
  roleForm: { code: string; label: string; description: string; permissions: string[]; is_core: boolean }
  roleEditMode: string
}

describe('RoleManagerDrawer', () => {
  beforeEach(() => vi.clearAllMocks())

  it('accountCount counts users per role', () => {
    const vm = mountDrawer().vm as unknown as Vm
    expect(vm.accountCount('admin')).toBe(1)
    expect(vm.accountCount('custom_x')).toBe(2)
  })

  it('saveRole (create) calls createRole and emits roles-changed', async () => {
    const w = mountDrawer()
    const vm = w.vm as unknown as Vm
    vm.handleAddRole()
    Object.assign(vm.roleForm, { code: 'new_r', label: '新角色', description: '', permissions: ['DASHBOARD'] })
    await vm.saveRole()
    await flushPromises()
    expect(createRole).toHaveBeenCalledWith(expect.objectContaining({ code: 'new_r', label: '新角色', permissions: ['DASHBOARD'] }))
    expect(w.emitted('roles-changed')).toBeTruthy()
  })

  it('saveRole (edit core role) omits permissions', async () => {
    const w = mountDrawer()
    const vm = w.vm as unknown as Vm
    vm.handleEditRole({ code: 'admin', label: '管理員', description: '全權', permissions: ['*'], is_core: true })
    await vm.saveRole()
    await flushPromises()
    expect(updateRole).toHaveBeenCalledWith('admin', expect.not.objectContaining({ permissions: expect.anything() }))
  })

  it('saveRole 送出中重複呼叫不重送（saving 守衛，防序列雙擊建重複/誤導 toast）', async () => {
    let resolve!: (v: unknown) => void
    createRole.mockReturnValueOnce(new Promise((r) => { resolve = r }))
    const w = mountDrawer()
    const vm = w.vm as unknown as Vm
    vm.handleAddRole()
    Object.assign(vm.roleForm, { code: 'r_guard', label: '守衛角色', description: '', permissions: ['DASHBOARD'] })
    const p1 = vm.saveRole()
    const p2 = vm.saveRole()
    expect(createRole).toHaveBeenCalledTimes(1)
    resolve({ data: {} })
    await Promise.all([p1, p2])
    await flushPromises()
  })

  it('renders 帳號數 column header', async () => {
    const w = mountDrawer()
    await nextTick()
    await flushPromises()
    expect(w.html()).toContain('帳號數')
  })
})
