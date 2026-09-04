/**
 * 探針與設定健檢分頁（SPEC-023 批次 1，Task 14）。
 *
 * ⚠ mock 資料形狀對齊真實 OpenAPI 產生型別（`schema.d.ts` 的
 * `ConfigCheckItemOut` / `ProbeCheckSummaryOut` / `ProbeRunOut`）：
 * `checks[].latest` 是巢狀 `ProbeRunOut | null`（含 `ok` / `detail` /
 * `status_code` / `ran_at`），不是扁平的 `latest_ok` / `latest_detail`。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  getProbes: vi.fn(),
  getConfigCheck: vi.fn(),
  hasPermission: vi.fn(() => false),
}))

vi.mock('@/api/parentMonitor', () => ({
  getParentMonitorProbes: h.getProbes,
  getParentMonitorConfigCheck: h.getConfigCheck,
}))
vi.mock('@/utils/auth', () => ({ hasPermission: h.hasPermission }))

import ProbesPanel from '../ProbesPanel.vue'

const stubs = {
  EmptyState: { props: ['title'], template: '<div class="empty">{{ title }}</div>' },
  'el-card': { template: '<div><slot /></div>' },
  'el-tag': { props: ['type'], template: '<span :data-type="type"><slot /></span>' },
  'el-table': { props: ['data'], template: '<table><tr v-for="(r,i) in data" :key="i"><td>{{ r.detail }}</td></tr></table>' },
  'el-table-column': { template: '<span />' },
  'el-link': { template: '<a><slot /></a>' },
}

const CHECKS = [
  {
    check_name: 'tenant_meta',
    availability: 1,
    total_runs: 24,
    latest: { check_name: 'tenant_meta', ok: true, detail: '正常', status_code: 200, ran_at: '2026-09-04T10:00:00+08:00' },
    failures: [],
  },
  {
    check_name: 'liff_login_negative',
    availability: 0.5,
    total_runs: 24,
    latest: { check_name: 'liff_login_negative', ok: false, detail: 'LINE 登入 channel ID 未設', status_code: null, ran_at: '2026-09-04T10:00:00+08:00' },
    failures: [],
  },
  {
    check_name: 'fe_entry',
    availability: 1,
    total_runs: 24,
    latest: { check_name: 'fe_entry', ok: true, detail: '正常', status_code: 200, ran_at: '2026-09-04T10:00:00+08:00' },
    failures: [],
  },
]

describe('ProbesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.hasPermission.mockReturnValue(false)
    h.getProbes.mockResolvedValue({ data: { enabled: true, hours: 24, checks: CHECKS } })
    h.getConfigCheck.mockResolvedValue({ data: { enabled: true, items: [] } })
  })

  it('健檢通過項顯示打勾', async () => {
    h.getConfigCheck.mockResolvedValue({
      data: { enabled: true, items: [{ key: 'line_login_channel_id', ok: true, detail: '已設定', fix_hint: '', link: null }] },
    })
    const w = mount(ProbesPanel, { global: { stubs } })
    await flushPromises()

    const row = w.find('[data-testid="check-line_login_channel_id"]')
    expect(row.exists()).toBe(true)
    expect(row.attributes('data-state')).toBe('ok')
  })

  it('健檢失敗項顯示修法與連結', async () => {
    h.getConfigCheck.mockResolvedValue({
      data: {
        enabled: true,
        items: [{
          key: 'line_login_channel_id',
          ok: false,
          detail: '未設定',
          fix_hint: '到 LINE 設定頁填入 MINI App channel 的 Channel ID',
          link: '/settings/line',
        }],
      },
    })
    const w = mount(ProbesPanel, { global: { stubs } })
    await flushPromises()

    const row = w.find('[data-testid="check-line_login_channel_id"]')
    expect(row.attributes('data-state')).toBe('error')
    expect(row.text()).toContain('MINI App channel')
  })

  it('LINE API 無法確認時不得顯示成失敗', async () => {
    h.getConfigCheck.mockResolvedValue({
      data: { enabled: true, items: [{ key: 'webhook_endpoint_matches', ok: null, detail: '無法確認：LINE API 無回應', fix_hint: '', link: null }] },
    })
    const w = mount(ProbesPanel, { global: { stubs } })
    await flushPromises()

    const row = w.find('[data-testid="check-webhook_endpoint_matches"]')
    expect(row.text()).toContain('無法確認')
    expect(row.attributes('data-state')).toBe('unknown')
  })

  it('健檢 key 顯示中文名稱，不得把原字串直接露給使用者', async () => {
    h.getConfigCheck.mockResolvedValue({
      data: { enabled: true, items: [{ key: 'webhook_endpoint_matches', ok: true, detail: '正常', fix_hint: '', link: null }] },
    })
    const w = mount(ProbesPanel, { global: { stubs } })
    await flushPromises()

    const row = w.find('[data-testid="check-webhook_endpoint_matches"]')
    expect(row.text()).not.toContain('webhook_endpoint_matches')
  })

  it('三個探針各顯示 24 小時可用率', async () => {
    const w = mount(ProbesPanel, { global: { stubs } })
    await flushPromises()

    expect(w.findAll('[data-testid^="probe-"]')).toHaveLength(3)
    expect(w.find('[data-testid="probe-liff_login_negative"]').text()).toContain('50')
  })

  it('健檢與探針皆無資料時顯示 EmptyState', async () => {
    h.getProbes.mockResolvedValue({ data: { enabled: true, hours: 24, checks: [] } })
    h.getConfigCheck.mockResolvedValue({ data: { enabled: true, items: [] } })
    const w = mount(ProbesPanel, { global: { stubs } })
    await flushPromises()

    expect(w.find('.empty').exists()).toBe(true)
  })

  it('public_origin 連結指向平台層頁面，無 PLATFORM_TENANTS_MANAGE 權限時不渲染連結只顯示 fix_hint', async () => {
    h.hasPermission.mockReturnValue(false)
    h.getConfigCheck.mockResolvedValue({
      data: {
        enabled: true,
        items: [{
          key: 'public_origin',
          ok: false,
          detail: '未設定對外網址',
          fix_hint: '請聯絡總部管理員設定對外網址',
          link: '/platform/tenants/3',
        }],
      },
    })
    const w = mount(ProbesPanel, { global: { stubs } })
    await flushPromises()

    const row = w.find('[data-testid="check-public_origin"]')
    expect(row.find('a').exists()).toBe(false)
    expect(row.text()).toContain('請聯絡總部管理員設定對外網址')
  })

  it('public_origin 連結指向平台層頁面，有 PLATFORM_TENANTS_MANAGE 權限時渲染連結', async () => {
    h.hasPermission.mockImplementation((perm: string) => perm === 'PLATFORM_TENANTS_MANAGE')
    h.getConfigCheck.mockResolvedValue({
      data: {
        enabled: true,
        items: [{
          key: 'public_origin',
          ok: false,
          detail: '未設定對外網址',
          fix_hint: '請聯絡總部管理員設定對外網址',
          link: '/platform/tenants/3',
        }],
      },
    })
    const w = mount(ProbesPanel, { global: { stubs } })
    await flushPromises()

    const row = w.find('[data-testid="check-public_origin"]')
    expect(row.find('a').exists()).toBe(true)
  })
})
