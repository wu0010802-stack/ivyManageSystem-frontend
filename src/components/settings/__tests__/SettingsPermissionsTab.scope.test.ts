import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'

// Mock API to inject scope_options into STUDENTS_READ
vi.mock('@/api/auth', () => ({
  getPermissions: vi.fn().mockResolvedValue({
    data: {
      permissions: {
        STUDENTS_READ: {
          value: 'STUDENTS_READ',
          label: '學生 (檢視)',
          is_core: true,
          scope_options: ['own_class', 'all'],
        },
        DASHBOARD: {
          value: 'DASHBOARD',
          label: '儀表板',
          is_core: true,
          scope_options: null,
        },
      },
      groups: [
        { name: '學生', permissions: ['STUDENTS_READ'], split_permissions: [] },
        { name: '一般', permissions: ['DASHBOARD'], split_permissions: [] },
      ],
      roles: {
        teacher: {
          label: '教師',
          description: '教師角色',
          permissions: ['STUDENTS_READ:own_class'],
          is_core: false,
        },
      },
    },
  }),
}))

vi.mock('@/api/permissions_admin', () => ({
  createRole: vi.fn().mockResolvedValue({ data: {} }),
  updateRole: vi.fn().mockResolvedValue({ data: {} }),
  deleteRole: vi.fn().mockResolvedValue({ data: { ok: true } }),
}))

vi.mock('@/utils/error', () => ({ apiError: vi.fn((e: unknown, msg: string) => msg) }))

import SettingsPermissionsTab from '../SettingsPermissionsTab.vue'

async function mountTab() {
  setActivePinia(createPinia())
  const wrapper = mount(SettingsPermissionsTab, {
    attachTo: document.body,
    global: { plugins: [ElementPlus] },
  })
  await flushPromises()
  await nextTick()
  return wrapper
}

describe('SettingsPermissionsTab — scope helpers (via defineExpose)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('splitPermKey: splits complex key into code and scope', async () => {
    const wrapper = await mountTab()
    const vm = wrapper.vm as unknown as {
      splitPermKey: (key: string) => { code: string; scope: string | null }
    }
    expect(vm.splitPermKey('STUDENTS_READ:own_class')).toEqual({ code: 'STUDENTS_READ', scope: 'own_class' })
    expect(vm.splitPermKey('DASHBOARD')).toEqual({ code: 'DASHBOARD', scope: null })
    expect(vm.splitPermKey('STUDENTS_READ:all')).toEqual({ code: 'STUDENTS_READ', scope: 'all' })
  })

  it('togglePerm: adds bare key for no-scope permission', async () => {
    const wrapper = await mountTab()
    const vm = wrapper.vm as unknown as {
      togglePerm: (code: string, checked: boolean) => void
      roleForm: { permissions: string[] }
    }
    vm.roleForm.permissions = []
    vm.togglePerm('DASHBOARD', true)
    expect(vm.roleForm.permissions).toContain('DASHBOARD')
    // No colon — it is a bare key
    expect(vm.roleForm.permissions.find((k) => k.startsWith('DASHBOARD:'))).toBeUndefined()
  })

  it('togglePerm: adds scoped key with own_class default for STUDENTS_READ', async () => {
    const wrapper = await mountTab()
    const vm = wrapper.vm as unknown as {
      togglePerm: (code: string, checked: boolean) => void
      roleForm: { permissions: string[] }
    }
    vm.roleForm.permissions = []
    vm.togglePerm('STUDENTS_READ', true)
    expect(vm.roleForm.permissions).toContain('STUDENTS_READ:own_class')
  })

  it('isPermChecked: matches bare and scoped forms', async () => {
    const wrapper = await mountTab()
    const vm = wrapper.vm as unknown as {
      isPermChecked: (code: string) => boolean
      roleForm: { permissions: string[] }
    }
    vm.roleForm.permissions = ['STUDENTS_READ:own_class', 'DASHBOARD']
    expect(vm.isPermChecked('STUDENTS_READ')).toBe(true)
    expect(vm.isPermChecked('DASHBOARD')).toBe(true)
    expect(vm.isPermChecked('EMPLOYEES_READ')).toBe(false)
  })

  it('currentPermScope: returns scope for scoped permission, null for bare/unchecked', async () => {
    const wrapper = await mountTab()
    const vm = wrapper.vm as unknown as {
      currentPermScope: (code: string) => string | null
      roleForm: { permissions: string[] }
    }
    vm.roleForm.permissions = ['STUDENTS_READ:own_class', 'DASHBOARD']
    expect(vm.currentPermScope('STUDENTS_READ')).toBe('own_class')
    expect(vm.currentPermScope('DASHBOARD')).toBeNull()
    expect(vm.currentPermScope('EMPLOYEES_READ')).toBeNull()
  })

  it('setPermScope: updates scope of an existing scoped permission', async () => {
    const wrapper = await mountTab()
    const vm = wrapper.vm as unknown as {
      setPermScope: (code: string, scope: string) => void
      currentPermScope: (code: string) => string | null
      roleForm: { permissions: string[] }
    }
    vm.roleForm.permissions = ['STUDENTS_READ:own_class']
    vm.setPermScope('STUDENTS_READ', 'all')
    expect(vm.roleForm.permissions).toContain('STUDENTS_READ:all')
    expect(vm.roleForm.permissions).not.toContain('STUDENTS_READ:own_class')
    expect(vm.currentPermScope('STUDENTS_READ')).toBe('all')
  })

  it('togglePerm: removes entry when unchecking', async () => {
    const wrapper = await mountTab()
    const vm = wrapper.vm as unknown as {
      togglePerm: (code: string, checked: boolean) => void
      isPermChecked: (code: string) => boolean
      roleForm: { permissions: string[] }
    }
    vm.roleForm.permissions = ['STUDENTS_READ:own_class', 'DASHBOARD']
    vm.togglePerm('STUDENTS_READ', false)
    expect(vm.isPermChecked('STUDENTS_READ')).toBe(false)
    // DASHBOARD untouched
    expect(vm.isPermChecked('DASHBOARD')).toBe(true)
  })

  it('scope radio row does NOT render for permissions without scope_options', async () => {
    const wrapper = await mountTab()
    const vm = wrapper.vm as unknown as {
      roleForm: { permissions: string[]; code: string; label: string; description: string; is_core: boolean }
      roleDialogVisible: boolean
    }
    // Set up a non-core role edit with DASHBOARD checked (no scope_options)
    Object.assign(vm.roleForm, {
      code: 'teacher',
      label: '教師',
      description: '',
      permissions: ['DASHBOARD'],
      is_core: false,
    })
    // defineExpose returns the unwrapped ref value — use wrapper.setData approach instead
    // Open dialog via internal click to avoid ref unwrapping complexity
    const addBtn = wrapper.find('.add-role-btn')
    await addBtn.trigger('click')
    await nextTick()
    await flushPromises()
    // Should NOT have any perm-scope-row for DASHBOARD
    const scopeRow = document.querySelector('[data-perm-scope="DASHBOARD"]')
    expect(scopeRow).toBeNull()
  })
})
