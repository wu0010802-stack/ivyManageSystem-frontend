/**
 * StudentFeeView：工作區 lazy mount 與 ?ws=/?view=（含舊 ?tab=）URL 同步。
 * （2026-08-25 任務導向 IA 改版：8 同層 tab → 工作台/帳單/對帳/結算＋費用設定）
 *
 * - 非作用中的工作區不得在進頁時就 mount（各套資料不重複載）。
 * - 舊 ?tab= 深連結相容映射；非法值 fallback 工作台。
 * - 外部 query 變動（瀏覽器上一頁）→ 工作區跟隨。
 * - 既有 ?search=<學生姓名> 行為保留，且 query 正規化不得新增其他鍵。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'

// --- Mock vue-router（replace/push 實際改 query，模擬導航收斂循環）---
const routerMocks = vi.hoisted(() => ({
  route: null as { query: Record<string, unknown> } | null,
  router: null as { replace: ReturnType<typeof vi.fn>; push: ReturnType<typeof vi.fn> } | null,
}))
vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  routerMocks.route = reactive({ query: {} as Record<string, unknown> })
  const apply = (to?: { query?: Record<string, unknown> }) => {
    routerMocks.route!.query = { ...(to?.query ?? {}) }
  }
  routerMocks.router = { replace: vi.fn(apply), push: vi.fn(apply) }
  return {
    useRoute: () => routerMocks.route,
    useRouter: () => routerMocks.router,
  }
})

// --- 五個工作區元件 stub（async chunk；各自行為由其專屬測試涵蓋）---
vi.mock('@/components/fees/workspace/FeeWorkbench.vue', () => ({
  __esModule: true,
  default: { name: 'FeeWorkbench', template: '<div data-test="ws-workbench" />' },
}))
vi.mock('@/components/fees/workspace/FeeBillingWorkspace.vue', () => ({
  __esModule: true,
  default: {
    name: 'FeeBillingWorkspace',
    props: ['view', 'studentSearch'],
    template: '<div data-test="ws-billing" :data-view="view" :data-search="studentSearch" />',
  },
}))
vi.mock('@/components/fees/workspace/FeeReconWorkspace.vue', () => ({
  __esModule: true,
  default: {
    name: 'FeeReconWorkspace',
    props: ['view'],
    template: '<div data-test="ws-recon" :data-view="view" />',
  },
}))
vi.mock('@/components/fees/workspace/FeeSettlementWorkspace.vue', () => ({
  __esModule: true,
  default: {
    name: 'FeeSettlementWorkspace',
    props: ['view'],
    template: '<div data-test="ws-settlement" :data-view="view" />',
  },
}))
vi.mock('@/components/fees/workspace/FeeSettingsWorkspace.vue', () => ({
  __esModule: true,
  default: {
    name: 'FeeSettingsWorkspace',
    props: ['view'],
    template: '<div data-test="ws-settings" :data-view="view" />',
  },
}))

import StudentFeeView from '../StudentFeeView.vue'

const globalConfig = {
  stubs: {
    'el-segmented': {
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
            @click="$emit('change', o.value)"
          >{{ o.label }}</button>
        </div>
      `,
    },
    'el-button': { template: '<button type="button" v-bind="$attrs"><slot /></button>' },
    'el-icon': { template: '<i aria-hidden="true"><slot /></i>' },
    PageHeader: {
      template:
        '<header data-test="page-header">{{ title }}|{{ subtitle }}<slot name="actions" /></header>',
      props: ['title', 'subtitle'],
    },
  },
}

// async component（vitest 模組載入含 macrotask）＋ watch flush
const flushAll = async () => {
  for (let i = 0; i < 4; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}

const mountView = (query: Record<string, unknown> = {}) => {
  routerMocks.route!.query = { ...query }
  return mount(StudentFeeView, { global: globalConfig })
}

describe('StudentFeeView 工作區 lazy 與 query 同步（IA 改版）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routerMocks.route!.query = {}
  })

  it('預設工作台；其他工作區不預先 mount', async () => {
    const w = mountView()
    await flushAll()
    expect(w.find('[data-test="ws-workbench"]').exists()).toBe(true)
    expect(w.find('[data-test="ws-billing"]').exists()).toBe(false)
    expect(w.find('[data-test="ws-recon"]').exists()).toBe(false)
    expect(w.find('[data-test="ws-settlement"]').exists()).toBe(false)
    expect(w.find('[data-test="ws-settings"]').exists()).toBe(false)
  })

  it('切到帳單 → push 保存 ws/view 且保留其他 query（?search=）', async () => {
    const w = mountView({ search: '小明' })
    await flushAll()
    routerMocks.router!.push.mockClear()

    // ?search= 無 ws 時已導向帳單；先切走再切回，驗證 push 保留 search
    await w.find('[data-seg="recon"]').trigger('click')
    await flushAll()
    await w.find('[data-seg="billing"]').trigger('click')
    await flushAll()

    expect(w.find('[data-test="ws-billing"]').exists()).toBe(true)
    const lastPush = routerMocks.router!.push.mock.calls.at(-1)![0] as {
      query: Record<string, unknown>
    }
    expect(lastPush.query.search).toBe('小明')
    expect(lastPush.query.ws).toBe('billing')
  })

  it('舊深連結 ?tab=templates → 費用設定範本分頁 mount，工作台不 mount', async () => {
    const w = mountView({ tab: 'templates' })
    await flushAll()
    const settings = w.find('[data-test="ws-settings"]')
    expect(settings.exists()).toBe(true)
    expect(settings.attributes('data-view')).toBe('templates')
    expect(w.find('[data-test="ws-workbench"]').exists()).toBe(false)
    expect(routerMocks.route!.query.tab).toBeUndefined()
  })

  it('非法 ?tab=bogus → fallback 工作台', async () => {
    const w = mountView({ tab: 'bogus' })
    await flushAll()
    expect(w.find('[data-test="ws-workbench"]').exists()).toBe(true)
  })

  it('外部 query 變動（上一頁）→ 工作區跟隨且新工作區 mount', async () => {
    const w = mountView()
    await flushAll()
    routerMocks.route!.query = { ws: 'settlement', view: 'close' }
    await flushAll()
    const settlement = w.find('[data-test="ws-settlement"]')
    expect(settlement.exists()).toBe(true)
    expect(settlement.attributes('data-view')).toBe('close')
  })

  it('?search= 導向帳款並下傳姓名；query 正規化不得新增其他鍵', async () => {
    const w = mountView({ search: '王小美' })
    await flushAll()
    const billing = w.find('[data-test="ws-billing"]')
    expect(billing.exists()).toBe(true)
    expect(billing.attributes('data-search')).toBe('王小美')
    // 正規化只補 ws/view 鍵；不得新增任何含姓名的新 query 鍵
    for (const call of routerMocks.router!.replace.mock.calls) {
      const q = (call[0] as { query: Record<string, unknown> }).query
      expect(Object.keys(q).sort()).toEqual(['search', 'view', 'ws'])
      expect(q.search).toBe('王小美')
    }
  })

  it('subtitle 為不誤導文案（不宣稱「本學期」）', async () => {
    const w = mountView()
    await flushAll()
    const header = w.find('[data-test="page-header"]').text()
    expect(header).toContain('收款、對帳與結算的日常工作區')
    expect(header).not.toContain('本學期')
  })
})
