import { describe, it, expect, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { shallowMount, flushPromises } from '@vue/test-utils'

const mockIsMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({ useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }) }))

const fakeLog = {
  id: 1,
  entity_type: 'employee',
  entity_id: 12,
  action: 'update',
  username: 'admin',
  ip_address: '10.0.0.1',
  created_at: '2026-08-03T09:15:00',
  summary: '更新員工基本資料',
  changes: { name: { old: '甲', new: '乙' } },
}
vi.mock('@/api/audit', () => ({
  getAuditLogs: vi.fn(() => Promise.resolve({ data: { items: [fakeLog], total: 1 } })),
  getAuditLogsMeta: vi.fn(() => Promise.resolve({ data: { entity_types: [], actions: [], field_labels: {} } })),
  exportAuditLogs: vi.fn(),
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

import AuditLogView from '@/views/AuditLogView.vue'

const globalStubs = {
  stubs: {
    'el-card': { template: '<div><slot /></div>' },
    'el-drawer': { template: '<div></div>' },
    'el-table': { name: 'ElTable', template: '<div class="el-table"><slot /></div>' },
    'el-table-column': { name: 'ElTableColumn', template: '<div></div>' },
  },
}

describe('AuditLogView 手機卡片切換', () => {
  it('桌機顯示 el-table、手機顯示 AdminListCards', async () => {
    mockIsMobile.value = false
    const w = shallowMount(AuditLogView, { global: globalStubs })
    await flushPromises()
    await nextTick()
    expect(w.find('.el-table').exists()).toBe(true)
    expect(w.findComponent({ name: 'AdminListCards' }).exists()).toBe(false)

    mockIsMobile.value = true
    await nextTick()
    expect(w.findComponent({ name: 'AdminListCards' }).exists()).toBe(true)
    expect(w.find('.el-table').exists()).toBe(false)
  })
})
