/**
 * 學費管理 IA 殼層測試（2026-08-25 任務導向改版）。
 *
 * 涵蓋：預設進入工作台、四主入口切換、舊 ?tab= 深連結相容映射、
 * 費用設定入口/返回、lazy（同時只掛載一個工作區）、全域搜尋導向帳款。
 * 各工作區內部行為在 FeeWorkbench / FeeWorkspaces / FeeReconTabs 等測試覆蓋。
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
    props: ['view', 'studentSearch'],
    template: '<div data-testid="ws-billing" :data-view="view" :data-search="studentSearch" />',
  },
}))
vi.mock('@/components/fees/BankReconTab.vue', () => ({
  __esModule: true,
  default: { name: 'BankReconTab', template: '<div data-testid="ws-recon" />' },
}))
vi.mock('@/components/fees/workspace/FeeSettlementWorkspace.vue', () => ({
  __esModule: true,
  default: {
    name: 'FeeSettlementWorkspace',
    props: ['view'],
    template: '<div data-testid="ws-settlement" :data-view="view" />',
  },
}))
vi.mock('@/components/fees/workspace/FeeSettingsWorkspace.vue', () => ({
  __esModule: true,
  default: {
    name: 'FeeSettingsWorkspace',
    props: ['view'],
    template: '<div data-testid="ws-settings" :data-view="view" />',
  },
}))

// ── EP stubs ───────────────────────────────────────────────────────────────
const ElSegmentedStub = {
  name: 'ElSegmented',
  props: ['modelValue', 'options', 'size'],
  emits: ['change'],
  template: `
    <div>
      <button
        v-for="o in options"
        :key="o.value"
        type="button"
        :data-seg="o.value"
        :data-active="o.value === modelValue"
        @click="$emit('change', o.value)"
      >{{ o.label }}</button>
    </div>
  `,
}

const GLOBAL_STUBS = {
  'el-segmented': ElSegmentedStub,
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

function mountView(query = {}) {
  routerMocks.route.query = { ...query }
  return mount(StudentFeeView, { global: { stubs: GLOBAL_STUBS } })
}

describe('StudentFeeView（任務導向 IA 殼層）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routerMocks.route.query = {}
  })

  it('預設進入工作台，且 URL 正規化為 ?ws=workbench', async () => {
    const wrapper = mountView()
    await flushAll()
    expect(wrapper.find('[data-testid="ws-workbench"]').exists()).toBe(true)
    expect(routerMocks.router.replace).toHaveBeenCalledWith({
      query: expect.objectContaining({ ws: 'workbench' }),
    })
  })

  it('主導航恰為四項：工作台/帳單/對帳/結算', async () => {
    const wrapper = mountView()
    await flushAll()
    const nav = wrapper.find('[data-test="fee-main-nav"]')
    expect(nav.exists()).toBe(true)
    const labels = nav.findAll('button').map((b) => b.text())
    expect(labels).toEqual(['工作台', '帳單', '對帳', '結算'])
  })

  it('lazy：同時只掛載目前工作區（其餘不出現在 DOM）', async () => {
    const wrapper = mountView()
    await flushAll()
    expect(wrapper.find('[data-testid="ws-workbench"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="ws-billing"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="ws-recon"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="ws-settlement"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="ws-settings"]').exists()).toBe(false)
  })

  it('四個主入口可切換並以 query 保存工作區', async () => {
    const wrapper = mountView()
    await flushAll()

    await wrapper.find('[data-seg="billing"]').trigger('click')
    await flushAll()
    expect(routerMocks.router.push).toHaveBeenCalledWith({
      query: expect.objectContaining({ ws: 'billing', view: 'records' }),
    })
    expect(wrapper.find('[data-testid="ws-billing"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="ws-billing"]').attributes('data-view')).toBe('records')

    await wrapper.find('[data-seg="recon"]').trigger('click')
    await flushAll()
    expect(wrapper.find('[data-testid="ws-recon"]').exists()).toBe(true)

    await wrapper.find('[data-seg="settlement"]').trigger('click')
    await flushAll()
    expect(wrapper.find('[data-testid="ws-settlement"]').attributes('data-view')).toBe('handover')

    await wrapper.find('[data-seg="workbench"]').trigger('click')
    await flushAll()
    expect(wrapper.find('[data-testid="ws-workbench"]').exists()).toBe(true)
  })

  it.each([
    ['records', 'ws-billing', 'records'],
    ['templates', 'ws-settings', 'templates'],
    ['refunds', 'ws-billing', 'refunds'],
    ['bankRecon', 'ws-recon', null],
    ['prepayments', 'ws-billing', 'records'],
    ['cashHandover', 'ws-settlement', 'handover'],
    ['close', 'ws-settlement', 'close'],
    ['billingCodes', 'ws-settings', 'billingCodes'],
  ])('舊深連結 ?tab=%s 映射到 %s（view=%s）', async (tab, testid, view) => {
    const wrapper = mountView({ tab })
    await flushAll()
    const target = wrapper.find(`[data-testid="${testid}"]`)
    expect(target.exists()).toBe(true)
    if (view) expect(target.attributes('data-view')).toBe(view)
    // tab 參數被正規化移除
    expect(routerMocks.route.query.tab).toBeUndefined()
  })

  it('費用設定：由右上入口進入完整設定畫面，主導航隱藏、可返回', async () => {
    const wrapper = mountView()
    await flushAll()

    await wrapper.find('[data-test="open-fee-settings"]').trigger('click')
    await flushAll()
    expect(wrapper.find('[data-testid="ws-settings"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="ws-settings"]').attributes('data-view')).toBe('templates')
    expect(wrapper.find('[data-test="fee-main-nav"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="open-fee-settings"]').exists()).toBe(false)

    await wrapper.find('[data-test="exit-fee-settings"]').trigger('click')
    await flushAll()
    expect(wrapper.find('[data-testid="ws-workbench"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="fee-main-nav"]').exists()).toBe(true)
  })

  it('費用設定可直達銷帳碼（?ws=settings&view=billingCodes）', async () => {
    const wrapper = mountView({ ws: 'settings', view: 'billingCodes' })
    await flushAll()
    expect(wrapper.find('[data-testid="ws-settings"]').attributes('data-view')).toBe(
      'billingCodes',
    )
  })

  it('全域搜尋 ?search= 導向帳款並下傳關鍵字', async () => {
    const wrapper = mountView({ search: '王小明' })
    await flushAll()
    const billing = wrapper.find('[data-testid="ws-billing"]')
    expect(billing.exists()).toBe(true)
    expect(billing.attributes('data-view')).toBe('records')
    expect(billing.attributes('data-search')).toBe('王小明')
  })

  it('accessible name：主導航與費用設定入口具 aria-label', async () => {
    const wrapper = mountView()
    await flushAll()
    expect(wrapper.find('[data-test="fee-main-nav"]').exists()).toBe(true)
    expect(wrapper.find('nav[aria-label="學費管理工作區"]').exists()).toBe(true)
    expect(
      wrapper.find('[data-test="open-fee-settings"]').attributes('aria-label'),
    ).toBeTruthy()
  })
})
