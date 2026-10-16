import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'

const { getAuditLogs, getAuditLogsMeta, exportAuditLogs } = vi.hoisted(() => ({
  getAuditLogs: vi.fn(),
  getAuditLogsMeta: vi.fn(),
  exportAuditLogs: vi.fn(),
}))
vi.mock('@/api/audit', () => ({ getAuditLogs, getAuditLogsMeta, exportAuditLogs }))

import AuditLogView from '../AuditLogView.vue'

// AuditLogView 是 <script setup>，未 defineExpose 的內部 reactive 狀態仍可透過
// wrapper.vm 直接存取（同目錄 DataQualityView.test.ts 已用同一手法操作 filters）。
interface AuditLogViewVm {
  filters: { actor_type: string; [key: string]: unknown }
  handleSearch: () => void
  handleReset: () => void
}

const makeRouter = (): Router =>
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/audit-logs', component: AuditLogView }, { path: '/', redirect: '/audit-logs' }],
  })

const mountReady = async () => {
  const router = makeRouter()
  await router.push('/audit-logs')
  await router.isReady()
  const wrapper = mount(AuditLogView, {
    global: {
      plugins: [ElementPlus, router],
      // el-select/el-option 真實渲染會走 teleport popper，測試環境抓不到選項節點，
      // 故比照本目錄 DataQualityView.test.ts 慣例 stub 成直出 slot 的容器。
      stubs: {
        'el-table': true,
        'el-table-column': true,
        'el-select': { template: '<div><slot /></div>' },
        'el-option': { template: '<div><slot /></div>' },
      },
    },
  })
  await flushPromises()
  return { wrapper, router, vm: wrapper.vm as unknown as AuditLogViewVm }
}

describe('AuditLogView 操作者類型篩選', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAuditLogsMeta.mockResolvedValue({ data: { entity_types: [], actions: [], field_labels: {} } })
    getAuditLogs.mockResolvedValue({ data: { items: [], total: 0 } })
  })

  it('選了操作者類型後，查詢參數帶 actor_type', async () => {
    const { vm } = await mountReady()
    getAuditLogs.mockClear()

    vm.filters.actor_type = 'parent'
    vm.handleSearch()
    await flushPromises()

    const params = getAuditLogs.mock.calls.at(-1)![0] as Record<string, unknown>
    expect(params.actor_type).toBe('parent')
  })

  it('actor_type 會同步進 URL query', async () => {
    const { vm, router } = await mountReady()

    vm.filters.actor_type = 'parent'
    vm.handleSearch()
    await flushPromises()

    expect(router.currentRoute.value.query.actor_type).toBe('parent')
  })

  it('重置會清掉 actor_type', async () => {
    const { vm } = await mountReady()
    vm.filters.actor_type = 'parent'

    vm.handleReset()
    await flushPromises()

    expect(vm.filters.actor_type).toBe('')
  })

  it('meta 回傳的四個選項都渲染成 option', async () => {
    getAuditLogsMeta.mockResolvedValue({
      data: {
        entity_types: [],
        actions: [],
        actor_types: [
          { value: 'staff', label: '員工' },
          { value: 'parent', label: '家長' },
          { value: 'system', label: '系統' },
          { value: 'anonymous', label: '匿名' },
        ],
      },
    })
    const { wrapper } = await mountReady()

    expect(wrapper.findAll('[data-testid="actor-type-option"]')).toHaveLength(4)
  })

  it('從 URL query 帶 actor_type 進來會被 hydrate 進 filters（監控頁「在操作紀錄查看全部」的主要使用路徑）', async () => {
    const router = makeRouter()
    await router.push({ path: '/audit-logs', query: { actor_type: 'parent' } })
    await router.isReady()
    const wrapper = mount(AuditLogView, {
      global: {
        plugins: [ElementPlus, router],
        stubs: {
          'el-table': true,
          'el-table-column': true,
          'el-select': { template: '<div><slot /></div>' },
          'el-option': { template: '<div><slot /></div>' },
        },
      },
    })
    await flushPromises()
    const vm = wrapper.vm as unknown as AuditLogViewVm

    expect(vm.filters.actor_type).toBe('parent')
    const params = getAuditLogs.mock.calls.at(-1)![0] as Record<string, unknown>
    expect(params.actor_type).toBe('parent')
  })
})
