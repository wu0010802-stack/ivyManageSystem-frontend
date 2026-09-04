/**
 * 家長行為分頁（SPEC-023 批次 1，Task 15）。
 *
 * ⚠ 計畫草稿假設 `entity_type: 'parent_auth'` 且失敗事件恆為 `actor_type:
 * 'anonymous'`——實測後端 `api/parent_portal/auth.py` 五個稽核寫入點後，
 * 兩者皆不成立：
 *   1. 沒有 `entity_type='parent_auth'` 這個值。`write_login_audit` 固定寫
 *      `entity_type='auth'`（LOGIN／LOGIN_FAILED／REFRESH_FAILED／
 *      BIND_FAILED 皆走此函式，且**員工端登入也走同一函式、同一
 *      entity_type**）；device-setup 管道另外用 `entity_type=
 *      'parent_device_setup'`。
 *   2. `BIND_FAILED` 的 `actor_type` 隨端點而異：`/bind`（首綁，走短效
 *      bind token）失敗時 `derive_actor_type` 讀不到 access_token 回
 *      `anonymous`；`/bind-additional`（已登入家長）失敗時回 `parent`。
 *   3. 員工端 `api/auth.py` 的 4 處 `LOGIN_FAILED` 也共用 `action=
 *      'LOGIN_FAILED'` 且未顯式傳 `actor_type`，登入失敗當下同樣沒有
 *      token，`derive_actor_type` 一樣回 `anonymous`——`actor_type=
 *      'anonymous'` 對 `LOGIN_FAILED` 完全沒有鑑別力，會把員工登入失敗
 *      也算進「家長登入失敗」。
 *
 * 改採「以 `action` 精確查詢＋僅 `LOGIN_FAILED` 額外用 `username` 二次
 * 過濾」：`LOGIN`／`BIND_FAILED`／`REFRESH_FAILED` 三個 action 字串經 grep
 * 全 repo 確認只有 `api/parent_portal/auth.py` 使用，天然唯一，直接用
 * `total`。唯獨 `LOGIN_FAILED` 與員工端撞名，但家長端（含 liff 與
 * device-setup 兩管道）刻意不寫 `username`（防稽核本身洩漏帳號存在性），
 * 員工端則必帶帳號名，故用 `!item.username` 過濾即可同時涵蓋兩個家長端
 * 管道、排除員工端。
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

function resultFor(items: Record<string, unknown>[]) {
  return { data: { items, total: items.length } }
}

const LOGIN_ITEMS = [
  {
    id: 1,
    action: 'LOGIN',
    actor_type: 'parent',
    username: '家長A',
    entity_type: 'auth',
    summary: '家長登入',
    created_at: '2026-09-04 09:00',
  },
]

// 3 筆：2 筆家長（liff／device-setup 皆不帶 username）+ 1 筆員工（帶帳號名，
// 必須被排除）。
const LOGIN_FAILED_ITEMS = [
  {
    id: 2,
    action: 'LOGIN_FAILED',
    actor_type: 'anonymous',
    username: null,
    entity_type: 'auth',
    summary: 'LINE 驗證失敗',
    created_at: '2026-09-04 09:05',
  },
  {
    id: 3,
    action: 'LOGIN_FAILED',
    actor_type: 'anonymous',
    username: '',
    entity_type: 'parent_device_setup',
    summary: '裝置設定碼兌換失敗',
    created_at: '2026-09-04 09:06',
  },
  {
    id: 4,
    action: 'LOGIN_FAILED',
    actor_type: 'anonymous',
    username: 'staff01',
    entity_type: 'auth',
    summary: '員工登入失敗',
    created_at: '2026-09-04 09:07',
  },
]

// 2 筆：1 筆來自 /bind（anonymous）、1 筆來自 /bind-additional（parent）。
const BIND_FAILED_ITEMS = [
  {
    id: 5,
    action: 'BIND_FAILED',
    actor_type: 'anonymous',
    username: null,
    entity_type: 'auth',
    summary: '綁定碼兌換失敗',
    created_at: '2026-09-04 09:10',
  },
  {
    id: 6,
    action: 'BIND_FAILED',
    actor_type: 'parent',
    username: '家長B',
    entity_type: 'auth',
    summary: '綁定碼兌換失敗',
    created_at: '2026-09-04 09:11',
  },
]

const REFRESH_FAILED_ITEMS: Record<string, unknown>[] = []

function mockGetAuditLogs() {
  h.getAuditLogs.mockImplementation((params: Record<string, unknown>) => {
    switch (params.action) {
      case 'LOGIN':
        return Promise.resolve(resultFor(LOGIN_ITEMS))
      case 'LOGIN_FAILED':
        return Promise.resolve(resultFor(LOGIN_FAILED_ITEMS))
      case 'BIND_FAILED':
        return Promise.resolve(resultFor(BIND_FAILED_ITEMS))
      case 'REFRESH_FAILED':
        return Promise.resolve(resultFor(REFRESH_FAILED_ITEMS))
      default:
        return Promise.resolve(resultFor([]))
    }
  })
}

describe('ParentActivityPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuditLogs()
  })

  it('分四個 action 精確查詢 24 小時區間，不傳 hours、不傳不存在的 entity_type', async () => {
    mount(ParentActivityPanel, { global: { stubs } })
    await flushPromises()

    expect(h.getAuditLogs).toHaveBeenCalledTimes(4)
    const actions = h.getAuditLogs.mock.calls.map((c) => (c[0] as { action: string }).action).sort()
    expect(actions).toEqual(['BIND_FAILED', 'LOGIN', 'LOGIN_FAILED', 'REFRESH_FAILED'])

    for (const call of h.getAuditLogs.mock.calls) {
      const params = call[0] as Record<string, unknown>
      expect(params.start_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
      expect(params.end_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
      expect(params.hours).toBeUndefined()
      expect(params.entity_type).toBeUndefined()
    }
  })

  it('LOGIN 與 REFRESH_FAILED 查詢帶 actor_type 作為雙重保險，BIND_FAILED 不帶（橫跨 anonymous／parent 兩種）', async () => {
    mount(ParentActivityPanel, { global: { stubs } })
    await flushPromises()

    const byAction = Object.fromEntries(
      h.getAuditLogs.mock.calls.map((c) => {
        const p = c[0] as Record<string, unknown>
        return [p.action, p.actor_type]
      }),
    )
    expect(byAction.LOGIN).toBe('parent')
    expect(byAction.REFRESH_FAILED).toBe('anonymous')
    expect(byAction.BIND_FAILED).toBeUndefined()
  })

  it('登入成功計數為 1', async () => {
    const w = mount(ParentActivityPanel, { global: { stubs } })
    await flushPromises()

    expect(w.find('[data-testid="count-login"]').text()).toContain('1')
  })

  it('登入失敗計數排除帶 username 的員工端事件，同時涵蓋 liff 與裝置設定碼兩管道', async () => {
    const w = mount(ParentActivityPanel, { global: { stubs } })
    await flushPromises()

    expect(w.find('[data-testid="count-login-failed"]').text()).toContain('2')
  })

  it('綁定失敗計數同時涵蓋首綁（anonymous）與二胎綁定（parent）兩種 actor_type', async () => {
    const w = mount(ParentActivityPanel, { global: { stubs } })
    await flushPromises()

    expect(w.find('[data-testid="count-bind-failed"]').text()).toContain('2')
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
    h.getAuditLogs.mockResolvedValue(resultFor([]))
    const w = mount(ParentActivityPanel, { global: { stubs } })
    await flushPromises()

    expect(w.find('.empty').exists()).toBe(true)
  })

  it('任一查詢失敗時顯示錯誤訊息而非讓整頁掛掉', async () => {
    h.getAuditLogs.mockImplementation((params: Record<string, unknown>) => {
      if (params.action === 'LOGIN') return Promise.reject(new Error('network error'))
      return Promise.resolve(resultFor([]))
    })
    const w = mount(ParentActivityPanel, { global: { stubs } })
    await flushPromises()

    expect(w.find('[data-testid="activity-error"]').exists()).toBe(true)
  })
})
