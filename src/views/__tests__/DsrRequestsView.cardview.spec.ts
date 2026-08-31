import { describe, it, expect, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { shallowMount, flushPromises } from '@vue/test-utils'

const mockIsMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({ useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }) }))

const fakeDsr = {
  id: 12,
  request_type: 'delete',
  status: 'pending',
  subject_entity_type: 'guardian',
  subject_entity_id: 88,
  reason: '要求刪除個資',
  submitted_at: '2026-08-03 09:00',
}
vi.mock('@/api/dsr', () => ({
  listDsrRequests: vi.fn(() => Promise.resolve({ data: [fakeDsr] })),
  approveDsrRequest: vi.fn(),
  rejectDsrRequest: vi.fn(),
}))

import DsrRequestsView from '@/views/DsrRequestsView.vue'

const globalStubs = {
  stubs: {
    'el-table': { name: 'ElTable', template: '<div class="el-table"><slot /></div>' },
    'el-table-column': { name: 'ElTableColumn', template: '<div></div>' },
  },
}

describe('DsrRequestsView 手機卡片切換', () => {
  it('桌機顯示 el-table、手機顯示 AdminListCards', async () => {
    mockIsMobile.value = false
    const w = shallowMount(DsrRequestsView, { global: globalStubs })
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
