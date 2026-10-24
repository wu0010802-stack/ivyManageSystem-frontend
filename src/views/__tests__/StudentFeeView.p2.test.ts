/**
 * 2026-09-07 bug hunt 第二批：/fees 殼層的網址與可及性。
 *
 * - ?search= 是全域搜尋帶進來的一次性上下文，切走工作區時必須丟掉，否則
 *   收款頁永遠被那個學生姓名篩住（實測 170 列剩 11 列，切到工作台再切回
 *   收款仍是 11 列）。
 * - 匯入紀錄抽屜「關閉」用 replace，不再往 history 塞一筆；否則關掉後按
 *   上一頁會把抽屜重新打開（staging 實測會重開）。
 * - role="tablist" 必須履行 tabs pattern：aria-controls ＋ tabpanel ＋ 方向鍵。
 * - 各工作區最後停留的檢視要真的「session 內記憶」（離開 /fees 再回來仍在）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'

// route 必須是 reactive：resolved 是 computed(route.query)，plain object
// 改 query 不會觸發重算，測不到「抽屜已開著時再關」這種兩段流程。
const routerMocks = vi.hoisted(() => ({
  route: { query: {} as Record<string, unknown>, path: '/fees' },
  router: { push: vi.fn(), replace: vi.fn() },
}))
const reactiveRoute = reactive(routerMocks.route)
vi.mock('vue-router', () => ({
  useRoute: () => reactiveRoute,
  useRouter: () => routerMocks.router,
}))

const apiMocks = vi.hoisted(() => ({
  getCloseSummary: vi.fn(),
  getCashHandovers: vi.fn(),
  getFeePeriods: vi.fn(),
  getFeeSummary: vi.fn(),
  getClosePeriods: vi.fn(),
  getBillSlipBatches: vi.fn(),
  getCollectionPayments: vi.fn(),
  getBankTransactions: vi.fn(),
}))
vi.mock('@/api/fees', () => apiMocks)

import StudentFeeView from '@/views/StudentFeeView.vue'
import {
  __resetFeeOverview,
} from '@/components/fees/workspace/useFeeOverview'
import { __resetFeeLastViews } from '@/components/fees/workspace/feesNavigation'

const STUBS = {
  PageHeader: { template: '<div data-test="page-header">學費管理</div>' },
  FeeWorkbench: { template: '<div data-test="ws-workbench" />' },
  FeeBillingWorkspace: {
    name: 'FeeBillingWorkspaceStub',
    props: ['view', 'source', 'importsOpen', 'studentSearch', 'recordsMode'],
    emits: ['change-view', 'change-source', 'change-mode', 'update:imports-open', 'navigate'],
    template: '<div data-test="ws-billing" :data-mode="recordsMode" />',
  },
  FeeSettlementWorkspace: { template: '<div data-test="ws-settlement" />' },
}

function mountView() {
  return mount(StudentFeeView, { global: { stubs: STUBS } })
}

const flushAll = async () => {
  for (let i = 0; i < 8; i += 1) await nextTick()
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetFeeOverview()
  __resetFeeLastViews()
  reactiveRoute.query = {}
  apiMocks.getCloseSummary.mockRejectedValue(new Error('n/a'))
  apiMocks.getCashHandovers.mockResolvedValue({ items: [] })
  apiMocks.getFeePeriods.mockResolvedValue([])
  apiMocks.getFeeSummary.mockResolvedValue({
    total_count: 0,
    unpaid_count: 0,
    partial_count: 0,
    total_unpaid: 0,
  })
  apiMocks.getClosePeriods.mockResolvedValue({ items: [] })
  apiMocks.getBillSlipBatches.mockResolvedValue([])
  apiMocks.getCollectionPayments.mockResolvedValue({ total: 0 })
  apiMocks.getBankTransactions.mockResolvedValue({ total: 0 })
})

/** 取最後一次 push 的 query */
function lastPushQuery(): Record<string, unknown> {
  const calls = routerMocks.router.push.mock.calls
  return (calls[calls.length - 1]?.[0] as { query: Record<string, unknown> }).query
}

describe('?search= 不得永久黏在網址上', () => {
  it('切到工作台時丟掉 search', async () => {
    reactiveRoute.query = { ws: 'billing', view: 'receivable', search: '王' }
    const w = mountView()
    await flushAll()
    await w.find('[data-test="fee-main-nav-workbench"]').trigger('click')
    expect(lastPushQuery()).not.toHaveProperty('search')
    expect(lastPushQuery().ws).toBe('workbench')
  })

  it('切到別的收款檢視時也丟掉 search', async () => {
    reactiveRoute.query = { ws: 'billing', view: 'receivable', search: '王' }
    const w = mountView()
    await flushAll()
    w.findComponent({ name: 'FeeBillingWorkspaceStub' }).vm.$emit('change-view', 'matching')
    await flushAll()
    expect(lastPushQuery()).not.toHaveProperty('search')
  })

  it('停在應收帳款時 search 保留（全域搜尋落地的當下不能被清掉）', async () => {
    reactiveRoute.query = { ws: 'billing', view: 'receivable', search: '王' }
    const w = mountView()
    await flushAll()
    w.findComponent({ name: 'FeeBillingWorkspaceStub' }).vm.$emit('change-mode', 'list')
    await flushAll()
    expect(lastPushQuery().search).toBe('王')
    expect(lastPushQuery().mode).toBe('list')
  })
})

describe('應收帳款檢視模式進 query', () => {
  it('?mode=list 會傳進收款工作區', async () => {
    reactiveRoute.query = { ws: 'billing', view: 'receivable', mode: 'list' }
    const w = mountView()
    await flushAll()
    expect(w.find('[data-test="ws-billing"]').attributes('data-mode')).toBe('list')
  })

  it('切換模式會 push 進網址（重新整理／上一頁回得來）', async () => {
    reactiveRoute.query = { ws: 'billing', view: 'receivable' }
    const w = mountView()
    await flushAll()
    w.findComponent({ name: 'FeeBillingWorkspaceStub' }).vm.$emit('change-mode', 'list')
    await flushAll()
    expect(lastPushQuery().mode).toBe('list')
  })
})

describe('匯入紀錄抽屜的歷史紀錄', () => {
  it('開啟用 push、關閉用 replace（關掉後上一頁不得把它重開）', async () => {
    reactiveRoute.query = { ws: 'billing', view: 'receivable' }
    const w = mountView()
    await flushAll()
    w.findComponent({ name: 'FeeBillingWorkspaceStub' }).vm.$emit('update:imports-open', true)
    await flushAll()
    expect(routerMocks.router.push).toHaveBeenCalled()
    expect(lastPushQuery().imports).toBe('1')

    reactiveRoute.query = { ws: 'billing', view: 'receivable', imports: '1' }
    routerMocks.router.replace.mockClear()
    await flushAll()
    w.findComponent({ name: 'FeeBillingWorkspaceStub' }).vm.$emit('update:imports-open', false)
    await flushAll()
    const replaced = routerMocks.router.replace.mock.calls.at(-1)?.[0] as {
      query: Record<string, unknown>
    }
    expect(replaced.query).not.toHaveProperty('imports')
  })
})

describe('主導航符合 WAI-ARIA tabs pattern', () => {
  it('每個 tab 有 aria-controls，且指向存在的 tabpanel', async () => {
    const w = mountView()
    await flushAll()
    const tabs = w.findAll('[role="tab"]')
    expect(tabs.length).toBe(3)
    for (const tab of tabs) {
      const id = tab.attributes('aria-controls')
      expect(id).toBeTruthy()
    }
    const panel = w.find('[role="tabpanel"]')
    expect(panel.exists()).toBe(true)
    const active = tabs.find((t) => t.attributes('aria-selected') === 'true')
    expect(active?.attributes('aria-controls')).toBe(panel.attributes('id'))
  })

  it('非作用中的 tab 不進 tab 序（roving tabindex）', async () => {
    const w = mountView()
    await flushAll()
    const tabs = w.findAll('[role="tab"]')
    const tabindexes = tabs.map((t) => t.attributes('tabindex'))
    expect(tabindexes.filter((v) => v === '0')).toHaveLength(1)
    expect(tabindexes.filter((v) => v === '-1')).toHaveLength(2)
  })

  it('右方向鍵切到下一個工作區', async () => {
    const w = mountView()
    await flushAll()
    await w.find('[data-test="fee-main-nav-workbench"]').trigger('keydown', {
      key: 'ArrowRight',
    })
    expect(lastPushQuery().ws).toBe('billing')
  })

  it('左方向鍵在第一項時繞回最後一項', async () => {
    const w = mountView()
    await flushAll()
    await w.find('[data-test="fee-main-nav-workbench"]').trigger('keydown', {
      key: 'ArrowLeft',
    })
    expect(lastPushQuery().ws).toBe('settlement')
  })
})

describe('各工作區最後停留的檢視是 session 內記憶', () => {
  it('離開 /fees 再回來（元件重新 mount）仍記得上次的檢視', async () => {
    reactiveRoute.query = { ws: 'billing', view: 'matching' }
    const first = mountView()
    await flushAll()
    first.unmount()

    // 重新進站落在工作台，再點「收款」應回到上次的入帳媒合
    reactiveRoute.query = { ws: 'workbench' }
    const second = mountView()
    await flushAll()
    await second.find('[data-test="fee-main-nav-billing"]').trigger('click')
    expect(lastPushQuery().view).toBe('matching')
  })
})
