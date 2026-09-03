/**
 * 學費管理 IA 殼層測試（2026-09-02 簡化改版：帳單＋對帳合併為「收款」）。
 *
 * 涵蓋：預設進入工作台、三主入口切換、費用設定已於 SPEC-019 全數退場、
 * 舊 ?tab= 與舊 ?ws=recon 深連結相容映射、lazy（同時只掛載
 * 一個工作區）、全域搜尋導向應收帳款、入帳來源與匯入抽屜的 query 同步。
 * 各工作區內部行為在 FeeWorkbench / FeeWorkspaces / FeeMatchingPanel 等測試覆蓋。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

// ── vue-router mock：replace/push 會實際改 route.query（模擬導航循環）──────
const routerMocks = vi.hoisted(() => ({ route: null, router: null }))

vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  routerMocks.route = reactive({ query: {} })
  const apply = (to) => {
    routerMocks.route.query = { ...(to?.query ?? {}) }
  }
  routerMocks.router = { replace: vi.fn(apply), push: vi.fn(apply) }
  return {
    useRoute: () => routerMocks.route,
    useRouter: () => routerMocks.router,
  }
})

// 主導航待辦數的資料源（殼層 onMounted 會 ensureLoaded）
const apiMocks = vi.hoisted(() => ({
  getCloseSummary: vi.fn(),
  getCashHandovers: vi.fn(),
  getFeePeriods: vi.fn(),
  getFeeSummary: vi.fn(),
  getClosePeriods: vi.fn(),
  getBillSlipBatches: vi.fn(),
  getCollectionPayments: vi.fn(),
}))
vi.mock('@/api/fees', () => apiMocks)

// ── 工作區元件全部 stub（lazy chunk 的實際內容各自有測試）─────────────────
vi.mock('@/components/fees/workspace/FeeWorkbench.vue', () => ({
  __esModule: true,
  default: {
    name: 'FeeWorkbench',
    template: '<div data-testid="ws-workbench" />',
  },
}))
vi.mock('@/components/fees/workspace/FeeBillingWorkspace.vue', () => ({
  __esModule: true,
  default: {
    name: 'FeeBillingWorkspace',
    props: ['view', 'source', 'importsOpen', 'studentSearch'],
    template:
      '<div data-testid="ws-billing" :data-view="view" :data-source="source" :data-imports="importsOpen ? \'1\' : \'0\'" :data-search="studentSearch" />',
  },
}))
vi.mock('@/components/fees/workspace/FeeSettlementWorkspace.vue', () => ({
  __esModule: true,
  default: {
    name: 'FeeSettlementWorkspace',
    props: ['view'],
    template: '<div data-testid="ws-settlement" :data-view="view" />',
  },
}))

// ── EP stubs ───────────────────────────────────────────────────────────────
const GLOBAL_STUBS = {
  'el-button': { template: '<button type="button" v-bind="$attrs"><slot /></button>' },
  'el-icon': { template: '<i aria-hidden="true"><slot /></i>' },
}

const flushAll = async () => {
  // async component（vitest 模組載入含 macrotask）＋ watch flush
  for (let i = 0; i < 4; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}

import StudentFeeView from '@/views/StudentFeeView.vue'
import { __resetFeeOverview } from '@/components/fees/workspace/useFeeOverview'

function mountView(query = {}) {
  routerMocks.route.query = { ...query }
  return mount(StudentFeeView, { global: { stubs: GLOBAL_STUBS } })
}

describe('StudentFeeView（任務導向 IA 殼層）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetFeeOverview()
    routerMocks.route.query = {}
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
  })

  it('預設進入工作台，且 URL 正規化為 ?ws=workbench', async () => {
    const wrapper = mountView()
    await flushAll()
    expect(wrapper.find('[data-testid="ws-workbench"]').exists()).toBe(true)
    expect(routerMocks.router.replace).toHaveBeenCalledWith({
      query: expect.objectContaining({ ws: 'workbench' }),
    })
  })

  it('主導航恰為三項：工作台/收款/結算（費用設定已退場）', async () => {
    const wrapper = mountView()
    await flushAll()
    const nav = wrapper.find('[data-test="fee-main-nav"]')
    expect(nav.exists()).toBe(true)
    const labels = nav
      .findAll('button')
      .map((b) => b.text().replace(/\s+/g, ''))
    expect(labels).toEqual(['工作台', '收款', '結算'])
    expect(wrapper.find('[data-test="open-fee-settings"]').exists()).toBe(false)
  })

  it('lazy：同時只掛載目前工作區（其餘不出現在 DOM）', async () => {
    const wrapper = mountView()
    await flushAll()
    expect(wrapper.find('[data-testid="ws-workbench"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="ws-billing"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="ws-settlement"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="ws-settings"]').exists()).toBe(false)
  })

  it('三個主入口可切換並以 query 保存工作區', async () => {
    const wrapper = mountView()
    await flushAll()

    await wrapper.find('[data-test="fee-main-nav-billing"]').trigger('click')
    await flushAll()
    expect(routerMocks.router.push).toHaveBeenCalledWith({
      query: expect.objectContaining({ ws: 'billing', view: 'receivable' }),
    })
    const billing = wrapper.find('[data-testid="ws-billing"]')
    expect(billing.exists()).toBe(true)
    expect(billing.attributes('data-view')).toBe('receivable')

    await wrapper.find('[data-test="fee-main-nav-settlement"]').trigger('click')
    await flushAll()
    expect(wrapper.find('[data-testid="ws-settlement"]').attributes('data-view')).toBe(
      'handover',
    )

    await wrapper.find('[data-test="fee-main-nav-workbench"]').trigger('click')
    await flushAll()
    expect(wrapper.find('[data-testid="ws-workbench"]').exists()).toBe(true)
  })

  it.each([
    ['records', 'ws-billing', 'receivable'],
    // SPEC-019：費用範本／銷帳碼已退場，舊深連結導向應收帳款
    ['templates', 'ws-billing', 'receivable'],
    ['refunds', 'ws-billing', 'refunds'],
    // 舊 bankRecon 深連結＝存摺對帳，落在收款／入帳媒合的存摺來源
    ['bankRecon', 'ws-billing', 'matching'],
    ['prepayments', 'ws-billing', 'receivable'],
    ['cashHandover', 'ws-settlement', 'handover'],
    ['close', 'ws-settlement', 'close'],
    ['billingCodes', 'ws-billing', 'receivable'],
  ])('舊深連結 ?tab=%s 映射到 %s（view=%s）', async (tab, testid, view) => {
    const wrapper = mountView({ tab })
    await flushAll()
    const target = wrapper.find(`[data-testid="${testid}"]`)
    expect(target.exists()).toBe(true)
    if (view) expect(target.attributes('data-view')).toBe(view)
    // tab 參數被正規化移除
    expect(routerMocks.route.query.tab).toBeUndefined()
  })

  it('舊深連結 ?ws=recon&view=passbook 映射到收款／入帳媒合（存摺來源）', async () => {
    const wrapper = mountView({ ws: 'recon', view: 'passbook' })
    await flushAll()
    const billing = wrapper.find('[data-testid="ws-billing"]')
    expect(billing.attributes('data-view')).toBe('matching')
    expect(billing.attributes('data-source')).toBe('passbook')
    expect(routerMocks.route.query.ws).toBe('billing')
  })

  it('舊深連結 ?ws=recon&view=billslips 映射到應收帳款並開啟發單批次抽屜', async () => {
    const wrapper = mountView({ ws: 'recon', view: 'billslips' })
    await flushAll()
    const billing = wrapper.find('[data-testid="ws-billing"]')
    expect(billing.attributes('data-view')).toBe('receivable')
    expect(billing.attributes('data-imports')).toBe('1')
  })

  it('入帳來源切換寫回 query（change-source）', async () => {
    const wrapper = mountView({ ws: 'billing', view: 'matching' })
    await flushAll()
    wrapper.findComponent({ name: 'FeeBillingWorkspace' }).vm.$emit('change-source', 'passbook')
    await flushAll()
    expect(routerMocks.route.query.src).toBe('passbook')
    expect(wrapper.find('[data-testid="ws-billing"]').attributes('data-source')).toBe(
      'passbook',
    )
  })

  it('發單批次抽屜開關寫回 query（update:imports-open）', async () => {
    const wrapper = mountView({ ws: 'billing', view: 'receivable' })
    await flushAll()
    const ws = wrapper.findComponent({ name: 'FeeBillingWorkspace' })
    ws.vm.$emit('update:imports-open', true)
    await flushAll()
    expect(routerMocks.route.query.imports).toBe('1')
    ws.vm.$emit('update:imports-open', false)
    await flushAll()
    expect(routerMocks.route.query.imports).toBeUndefined()
  })

  it('全域搜尋 ?search= 導向應收帳款並下傳關鍵字', async () => {
    const wrapper = mountView({ search: '王小明' })
    await flushAll()
    const billing = wrapper.find('[data-testid="ws-billing"]')
    expect(billing.exists()).toBe(true)
    expect(billing.attributes('data-view')).toBe('receivable')
    expect(billing.attributes('data-search')).toBe('王小明')
  })

  it('accessible name：主導航具 aria-label', async () => {
    const wrapper = mountView()
    await flushAll()
    expect(wrapper.find('[data-test="fee-main-nav"]').exists()).toBe(true)
    expect(wrapper.find('nav[aria-label="學費管理工作區"]').exists()).toBe(true)
  })
})
