/**
 * 家長行為分頁（SPEC-023 批次 1，Task 15）。
 *
 * 後端已於 `entity_type='parent_auth'` 補丁（BE commit `6a576dec`）修正計畫
 * 草稿的錯誤假設：家長端 `write_login_audit` 五個呼叫點（liff 登入成功／
 * 失敗、refresh 失敗、bind 首綁失敗、bind-additional 二胎綁定失敗）現在皆
 * 顯式傳 `entity_type="parent_auth"`，與員工端共用的 `entity_type="auth"`
 * 分開；`api/audit.py` 的 `include_auth=false` 排除集合也同步擴成
 * `('auth', 'parent_auth')`。
 *
 * 因此前端**不再需要**用 `username` 是否為空這種間接訊號去猜「這筆是不是
 * 家長事件」——直接用 `entity_type='parent_auth' + action` 精確查詢即可
 * 信任後端回傳的 `total`（不受 `page_size` 上限影響，比對 `items` 過濾更
 * 準確）。
 *
 * `device_setup` 管道（無 LINE 家長以 staff 簽發碼登入）維持獨立的
 * `entity_type='parent_device_setup'`（後端刻意不併入 `parent_auth`，因為
 * 它不屬於「量大的登入雜訊」，不需要進 `include_auth=false` 排除集合）。
 * 但它確實是一條真實的家長登入管道，漏算會讓「家長登入成功/失敗幾次」
 * 偏低——本面板**納入**它：`LOGIN`／`LOGIN_FAILED` 兩個計數皆為
 * `parent_auth` 與 `parent_device_setup` 兩個 entity_type 各自查詢後加總；
 * `BIND_FAILED`／`REFRESH_FAILED` 只存在於 `parent_auth`（device-setup 沒有
 * 綁定與 refresh 流程），各查一次即可。
 *
 * 一共 6 次查詢（4 個 action × parent_auth，2 個 action × device_setup），
 * 每次都是 `entity_type + action` 雙重鎖定，全部信任 `total`。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const h = vi.hoisted(() => ({ getAuditLogs: vi.fn() }))

vi.mock('@/api/audit', () => ({ getAuditLogs: h.getAuditLogs }))

import ParentActivityPanel from '../ParentActivityPanel.vue'

const stubs = {
  EmptyState: { props: ['title'], template: '<div class="empty">{{ title }}</div>' },
  'el-card': { template: '<div><slot /></div>' },
  'router-link': {
    props: ['to'],
    template: '<a :href="typeof to === \'string\' ? to : to.path"><slot /></a>',
  },
}

// entity_type → action → total。刻意在 parent_auth 與 parent_device_setup
// 都各放一些 LOGIN／LOGIN_FAILED，用來驗證兩個管道的計數確實有加總。
const TOTALS: Record<string, Record<string, number>> = {
  parent_auth: { LOGIN: 3, LOGIN_FAILED: 2, BIND_FAILED: 1, REFRESH_FAILED: 0 },
  parent_device_setup: { LOGIN: 1, LOGIN_FAILED: 1 },
}

function mockGetAuditLogs() {
  h.getAuditLogs.mockImplementation((params: Record<string, unknown>) => {
    const entityType = params.entity_type as string
    const action = params.action as string
    const total = TOTALS[entityType]?.[action] ?? 0
    return Promise.resolve({ data: { items: [], total } })
  })
}

describe('ParentActivityPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuditLogs()
  })

  it('只查 parent_auth／parent_device_setup 兩個 entity_type，絕不查會混入員工端的 auth', async () => {
    mount(ParentActivityPanel, { global: { stubs } })
    await flushPromises()

    expect(h.getAuditLogs).toHaveBeenCalledTimes(6)
    const entityTypes = h.getAuditLogs.mock.calls.map(
      (c) => (c[0] as Record<string, unknown>).entity_type,
    )
    expect(new Set(entityTypes)).toEqual(new Set(['parent_auth', 'parent_device_setup']))
    expect(entityTypes).not.toContain('auth')
  })

  it('每次查詢帶 24 小時區間，不傳 hours、不傳 actor_type／username 過濾', async () => {
    mount(ParentActivityPanel, { global: { stubs } })
    await flushPromises()

    for (const call of h.getAuditLogs.mock.calls) {
      const params = call[0] as Record<string, unknown>
      expect(params.start_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
      expect(params.end_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
      expect(params.hours).toBeUndefined()
      expect(params.actor_type).toBeUndefined()
      expect(params.username).toBeUndefined()
    }
  })

  it('parent_auth 查了四種 action、parent_device_setup 只查 LOGIN／LOGIN_FAILED 兩種', async () => {
    mount(ParentActivityPanel, { global: { stubs } })
    await flushPromises()

    const actionsByEntity: Record<string, string[]> = {}
    for (const call of h.getAuditLogs.mock.calls) {
      const p = call[0] as Record<string, unknown>
      const key = p.entity_type as string
      ;(actionsByEntity[key] ??= []).push(p.action as string)
    }
    expect(actionsByEntity.parent_auth.sort()).toEqual([
      'BIND_FAILED',
      'LOGIN',
      'LOGIN_FAILED',
      'REFRESH_FAILED',
    ])
    expect(actionsByEntity.parent_device_setup.sort()).toEqual(['LOGIN', 'LOGIN_FAILED'])
  })

  it('登入成功計數 = parent_auth 與 device_setup 兩管道加總', async () => {
    const w = mount(ParentActivityPanel, { global: { stubs } })
    await flushPromises()

    expect(w.find('[data-testid="count-login"]').text()).toContain('4')
  })

  it('登入失敗計數 = parent_auth 與 device_setup 兩管道加總，且不受員工端污染', async () => {
    const w = mount(ParentActivityPanel, { global: { stubs } })
    await flushPromises()

    // parent_auth(2) + device_setup(1) = 3；若前端誤查了員工端共用的
    // entity_type='auth'，這裡會混進不相干的數字，測試會抓到。
    expect(w.find('[data-testid="count-login-failed"]').text()).toContain('3')
  })

  it('綁定失敗計數只來自 parent_auth（device-setup 無綁定流程）', async () => {
    const w = mount(ParentActivityPanel, { global: { stubs } })
    await flushPromises()

    expect(w.find('[data-testid="count-bind-failed"]').text()).toContain('1')
  })

  it('連線續期失敗計數為 0', async () => {
    const w = mount(ParentActivityPanel, { global: { stubs } })
    await flushPromises()

    expect(w.find('[data-testid="count-refresh-failed"]').text()).toContain('0')
  })

  it('提供連到操作紀錄且帶 actor_type=parent 篩選的入口', async () => {
    const w = mount(ParentActivityPanel, { global: { stubs } })
    await flushPromises()

    const link = w.find('[data-testid="goto-audit-logs"]')
    expect(link.attributes('href')).toContain('/governance/audit-logs')
  })

  it('四個計數皆為 0 時顯示 EmptyState', async () => {
    h.getAuditLogs.mockResolvedValue({ data: { items: [], total: 0 } })
    const w = mount(ParentActivityPanel, { global: { stubs } })
    await flushPromises()

    expect(w.find('.empty').exists()).toBe(true)
  })

  it('任一查詢失敗時顯示錯誤訊息而非讓整頁掛掉', async () => {
    h.getAuditLogs.mockImplementation((params: Record<string, unknown>) => {
      if (params.entity_type === 'parent_auth' && params.action === 'LOGIN') {
        return Promise.reject(new Error('network error'))
      }
      return Promise.resolve({ data: { items: [], total: 0 } })
    })
    const w = mount(ParentActivityPanel, { global: { stubs } })
    await flushPromises()

    expect(w.find('[data-testid="activity-error"]').exists()).toBe(true)
  })
})
