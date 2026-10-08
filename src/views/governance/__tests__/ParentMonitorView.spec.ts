/**
 * 家長端監控頁（SPEC-023 批次 1）：總開關關閉時整頁 EmptyState、
 * 開啟時渲染九盞燈；未收集的訊號顯示「未收集」而非 0。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  getOverview: vi.fn(),
  getProbes: vi.fn(),
  getConfigCheck: vi.fn(),
}))

vi.mock('@/api/parentMonitor', () => ({
  getParentMonitorOverview: h.getOverview,
  getParentMonitorProbes: h.getProbes,
  getParentMonitorConfigCheck: h.getConfigCheck,
}))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))

import ParentMonitorView from '../ParentMonitorView.vue'

const NINE_LIGHTS = [
  { key: 'login_channel', level: 'green', reason: '正常', metric: null },
  { key: 'tenant_entry', level: 'green', reason: '正常', metric: null },
  { key: 'line_push', level: 'gray', reason: '24 小時內無推播', metric: null },
  { key: 'storage', level: 'green', reason: '正常', metric: null },
  { key: 'db_rls', level: 'green', reason: '正常', metric: null },
  { key: 'schedulers', level: 'gray', reason: '未啟用', metric: null },
  { key: 'api_errors', level: 'gray', reason: '未收集', metric: null },
  { key: 'silence', level: 'gray', reason: '未收集', metric: null },
  { key: 'client_events', level: 'gray', reason: '未收集', metric: null },
]

const ENABLED_OVERVIEW = {
  enabled: true,
  generated_at: '2026-09-04T10:00:00+08:00',
  overall: 'green',
  lights: NINE_LIGHTS,
  probes_latest: [],
  traffic_1h: null,
  client_events_24h: null,
  deliveries_24h: { attempted: 0, succeeded: 0, failed: 0, retrying: 0 },
}

const stubs = {
  PageHeader: { template: '<div><slot name="actions" /></div>' },
  EmptyState: { props: ['title', 'description'], template: '<div class="empty">{{ title }}</div>' },
  'el-tabs': { template: '<div><slot /></div>' },
  'el-tab-pane': { template: '<div><slot /></div>' },
  'el-button': { template: '<button><slot /></button>' },
  'el-tag': { template: '<span class="tag"><slot /></span>' },
  'el-card': { template: '<div><slot /></div>' },
}

describe('ParentMonitorView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.getOverview.mockResolvedValue({ data: ENABLED_OVERVIEW })
    h.getProbes.mockResolvedValue({ data: { checks: [] } })
    h.getConfigCheck.mockResolvedValue({ data: { items: [] } })
  })

  it('總開關關閉時顯示 EmptyState 並點出要設哪個環境變數', async () => {
    h.getOverview.mockResolvedValue({ data: { enabled: false } })
    const w = mount(ParentMonitorView, { global: { stubs } })
    await flushPromises()

    expect(w.find('[data-testid="monitor-disabled"]').exists()).toBe(true)
    expect(w.text()).toContain('PARENT_MONITOR_ENABLED')
    expect(w.find('[data-testid="lights-board"]').exists()).toBe(false)
  })

  it('開啟時渲染九盞燈與總燈', async () => {
    const w = mount(ParentMonitorView, { global: { stubs } })
    await flushPromises()

    expect(w.findAll('[data-testid^="light-"]')).toHaveLength(9)
    expect(w.find('[data-testid="overall-light"]').text()).toContain('正常')
  })

  it('未收集的訊號顯示「未收集」，不得顯示 0', async () => {
    const w = mount(ParentMonitorView, { global: { stubs } })
    await flushPromises()

    const apiLight = w.find('[data-testid="light-api_errors"]')
    expect(apiLight.text()).toContain('未收集')
    expect(apiLight.text()).not.toMatch(/\b0\b/)
  })

  it('載入失敗顯示錯誤訊息且不渲染燈板', async () => {
    h.getOverview.mockRejectedValueOnce({ displayMessage: '沒有權限' })
    const w = mount(ParentMonitorView, { global: { stubs } })
    await flushPromises()

    expect(w.find('[data-testid="monitor-error"]').text()).toContain('沒有權限')
    expect(w.find('[data-testid="lights-board"]').exists()).toBe(false)
  })
})
