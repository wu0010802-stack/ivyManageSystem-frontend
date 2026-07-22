import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() })
// happy-dom 的 HTMLAnchorElement.click() 內部會嘗試用（已被上面 stub 覆蓋、非建構函式的）
// 全域 URL 做導航解析而拋錯；此處與匯出邏輯無關，純屬環境雜訊，stub 掉避免汙染測試輸出。
HTMLAnchorElement.prototype.click = vi.fn()

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
    routes: [{ path: '/audit-logs', component: AuditLogView }, { path: '/', redirect: '/audit-logs' }],
  })

const mountView = async () => {
  const router = makeRouter()
  await router.push('/audit-logs')
  await router.isReady()
  return mount(AuditLogView, {
    global: { plugins: [ElementPlus, router], stubs: { 'el-table': true, 'el-table-column': true } },
  })
}

const clickQuickFilter = async (wrapper: Awaited<ReturnType<typeof mountView>>, label: string) => {
  const btn = wrapper.findAll('button').find((b) => b.text() === label)
  expect(btn, `找不到快篩按鈕：${label}`).toBeTruthy()
  await btn!.trigger('click')
  await flushPromises()
}

describe('AuditLogView 高風險快篩（伺服端化）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAuditLogsMeta.mockResolvedValue({ data: { entity_types: [], actions: [], field_labels: {} } })
    getAuditLogs.mockResolvedValue({ data: { items: [], total: 0 } })
  })

  it.each([
    ['退款', { risk_tag: 'refund' }],
    ['大額金流', { risk_tag: 'large_amount' }],
    ['強制放行', { risk_tag: 'force_overlay' }],
    ['已核准後修改', { risk_tag: 'reject_approved' }],
    ['登入限流/鎖定', { risk_tag: 'login_blocked' }],
    ['請假', { entity_type: 'leave' }],
    ['登入失敗', { entity_type: 'auth', action: 'LOGIN_FAILED' }],
  ])('點「%s」→ 以伺服端參數重查', async (label, expected) => {
    const wrapper = await mountView()
    await flushPromises()
    await clickQuickFilter(wrapper, label)
    const lastParams = getAuditLogs.mock.calls.at(-1)![0] as Record<string, unknown>
    for (const [k, v] of Object.entries(expected)) {
      expect(lastParams[k]).toBe(v)
    }
    expect(lastParams.page).toBe(1)
  })

  it('再點同一顆 → 清除條件重查', async () => {
    const wrapper = await mountView()
    await flushPromises()
    await clickQuickFilter(wrapper, '退款')
    await clickQuickFilter(wrapper, '退款')
    const lastParams = getAuditLogs.mock.calls.at(-1)![0] as Record<string, unknown>
    expect(lastParams.risk_tag).toBeUndefined()
  })

  it('匯出帶上作用中的 risk_tag', async () => {
    exportAuditLogs.mockResolvedValue({ data: 'csv' })
    getAuditLogs.mockResolvedValue({ data: { items: [{ id: 1 }], total: 1 } })
    const wrapper = await mountView()
    await flushPromises()
    await clickQuickFilter(wrapper, '大額金流')
    const exportBtn = wrapper.findAll('button').find((b) => b.text().includes('匯出 CSV'))
    await exportBtn!.trigger('click')
    await flushPromises()
    const params = exportAuditLogs.mock.calls.at(-1)![0] as Record<string, unknown>
    expect(params.risk_tag).toBe('large_amount')
  })

  it('頁面不再出現「純客端過濾」警示', async () => {
    const wrapper = await mountView()
    await flushPromises()
    expect(wrapper.text()).not.toContain('純客端過濾')
  })
})
