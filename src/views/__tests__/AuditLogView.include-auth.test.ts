import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory } from 'vue-router'

/**
 * 「刷新 Token」洗版（2026-08-04）：操作紀錄一頁 50 筆常有 40 筆以上是登入活動，
 * 業務操作被擠出畫面。列表預設帶 include_auth=false 隱藏，勾「含登入活動」才顯示；
 * 紀錄本身照常寫入（稽核不可缺）。CSV 匯出與列表共用同一組參數，口徑必須一致。
 */
const { getAuditLogs, getAuditLogsMeta, exportAuditLogs } = vi.hoisted(() => ({
  getAuditLogs: vi.fn(),
  getAuditLogsMeta: vi.fn(),
  exportAuditLogs: vi.fn(),
}))
vi.mock('@/api/audit', () => ({ getAuditLogs, getAuditLogsMeta, exportAuditLogs }))

import AuditLogView from '../AuditLogView.vue'

const makeRouter = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/audit-logs', component: AuditLogView },
      { path: '/', redirect: '/audit-logs' },
    ],
  })

interface SetupState {
  includeAuth: boolean
  handleSearch: () => void
  handleReset: () => void
  handleExport: () => Promise<void>
}

async function mountView() {
  const router = makeRouter()
  router.push('/audit-logs')
  await router.isReady()
  const wrapper = mount(AuditLogView, {
    global: { plugins: [ElementPlus, router] },
  })
  await flushPromises()
  return wrapper
}

describe('AuditLogView 登入活動預設隱藏', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAuditLogsMeta.mockResolvedValue({ data: { entity_types: [], actions: [] } })
    getAuditLogs.mockResolvedValue({ data: { items: [], total: 0 } })
    exportAuditLogs.mockResolvedValue({ data: new Blob(['x']) })
  })

  it('首次載入即帶 include_auth=false', async () => {
    await mountView()
    expect(getAuditLogs).toHaveBeenCalledWith(
      expect.objectContaining({ include_auth: false }),
    )
  })

  it('勾選「含登入活動」後不再送 include_auth（回到後端預設含全部）', async () => {
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as SetupState
    vm.includeAuth = true
    getAuditLogs.mockClear()

    vm.handleSearch()
    await flushPromises()

    const params = getAuditLogs.mock.calls[0][0] as Record<string, unknown>
    expect(params).not.toHaveProperty('include_auth')
  })

  it('重置回到預設隱藏', async () => {
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as SetupState
    vm.includeAuth = true
    await flushPromises()

    vm.handleReset()
    await flushPromises()

    expect(vm.includeAuth).toBe(false)
    expect(getAuditLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({ include_auth: false }),
    )
  })

  it('CSV 匯出與列表同口徑（畫面看到什麼就匯出什麼）', async () => {
    // 結果為空時 handleExport 會早退（既有行為），需給一筆才走到實際匯出
    getAuditLogs.mockResolvedValue({ data: { items: [{ id: 1 }], total: 1 } })
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as SetupState

    await vm.handleExport()
    await flushPromises()

    expect(exportAuditLogs).toHaveBeenCalledWith(
      expect.objectContaining({ include_auth: false }),
    )
  })
})
