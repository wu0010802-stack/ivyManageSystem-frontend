import { describe, it, expect, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { shallowMount } from '@vue/test-utils'

const mockIsMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({ useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }) }))

// 讓 shallowMount 不爆：mock 所有 onMounted 會拉的 store 與 API
vi.mock('@/api/auth', () => ({
  getUsers: vi.fn(() => Promise.resolve({ data: [] })),
  getPermissions: vi.fn(() => Promise.resolve({ data: { permissions: {}, groups: [], roles: {} } })),
  createUser: vi.fn(() => Promise.resolve({ data: {} })),
  updateUser: vi.fn(() => Promise.resolve({ data: {} })),
  deleteUser: vi.fn(() => Promise.resolve({ data: {} })),
  resetPassword: vi.fn(() => Promise.resolve({ data: {} })),
}))

vi.mock('@/stores/employee', async () => {
  const { ref } = await import('vue')
  return {
    useEmployeeStore: () => ({
      employees: ref([]),
      fetchEmployees: vi.fn(),
    }),
  }
})

vi.mock('@/api/permissions_admin', () => ({
  createRole: vi.fn(() => Promise.resolve({ data: {} })),
  updateRole: vi.fn(() => Promise.resolve({ data: {} })),
  deleteRole: vi.fn(() => Promise.resolve({ data: {} })),
}))

const replace = vi.fn()
let mockQuery: Record<string, unknown> = {}
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: mockQuery }),
  useRouter: () => ({ replace }),
}))

import SettingsAccountsTab from '@/components/settings/SettingsAccountsTab.vue'

const globalStubs = {
  stubs: {
    'el-table': { name: 'ElTable', template: '<div class="el-table"><slot /></div>' },
    'el-table-column': { name: 'ElTableColumn', template: '<div></div>' },
  },
}

describe('SettingsAccountsTab 手機卡片切換', () => {
  it('手機顯示 AdminListCards、桌機不顯示', async () => {
    mockIsMobile.value = true
    const w = shallowMount(SettingsAccountsTab, { global: globalStubs })
    await nextTick()
    expect(w.findComponent({ name: 'AdminListCards' }).exists()).toBe(true)

    mockIsMobile.value = false
    await nextTick()
    expect(w.findComponent({ name: 'AdminListCards' }).exists()).toBe(false)
  })
})
