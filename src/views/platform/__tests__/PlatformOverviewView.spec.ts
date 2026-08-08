/**
 * 總部總覽：分校卡片牆 + 月度指標。報表單校失敗時只標那一張卡片，不拖垮整頁。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed, defineComponent } from 'vue'

const h = vi.hoisted(() => ({
  listTenants: vi.fn(),
  getPlatformReport: vi.fn(),
}))

vi.mock('@/api/platform', () => ({
  listTenants: h.listTenants,
  getPlatformReport: h.getPlatformReport,
}))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))

import { _resetCacheForTesting } from '@/composables/useCachedAsync'
import PlatformOverviewView from '../PlatformOverviewView.vue'

const TENANTS = [
  { id: 2, slug: 'branch-a', name: 'A 校', kind: 'school', status: 'active', student_count: 100, employee_count: 12, public_origin: 'https://a.tw' },
  { id: 3, slug: 'branch-b', name: 'B 校', kind: 'school', status: 'suspended', student_count: 20, employee_count: 3, public_origin: null },
  { id: 1, slug: 'hq', name: '總部', kind: 'platform', status: 'active', student_count: null, employee_count: null, public_origin: null },
]

const stubs = {
  PageHeader: { template: '<div><slot name="actions" /></div>' },
  EmptyState: { template: '<div class="empty" />' },
  'el-alert': { props: ['title'], template: '<div class="el-alert">{{ title }}</div>' },
  'el-button': { props: ['loading'], template: '<button><slot /></button>' },
  'el-tag': { template: '<span><slot /></span>' },
  'router-link': { props: ['to'], template: '<a><slot /></a>' },
  'el-card': { template: '<div><slot name="header" /><slot /></div>' },
  // el-table/el-table-column：比照 PlatformReportsView.spec.ts 的 el-table 資料驅動寫法，
  // 但額外用 provide/inject 承接每個 el-table-column 的 scoped default slot（`{ row }`），
  // 讓警示標色斷言能命中真實 cell 內容，而不是退回原生 <table> 規避這個問題。
  'el-table': defineComponent({
    props: ['data'],
    provide() {
      return { healthTableRows: computed(() => this.data ?? []) }
    },
    template: '<div class="el-table-stub"><slot /></div>',
  }),
  'el-table-column': defineComponent({
    props: ['label'],
    inject: ['healthTableRows'],
    template:
      '<div class="el-table-column-stub"><div v-for="(row, i) in healthTableRows" :key="i" class="cell"><slot :row="row" /></div></div>',
  }),
}

const OVERVIEW_FIXTURE = {
  data: {
    category: 'platform_overview',
    params: {},
    totals: {},
    tenants: [
      { tenant_id: 2, slug: 'branch-a', name: 'A 校', data: { student_count: 100 }, error: null },
      { tenant_id: 3, slug: 'branch-b', name: 'B 校', data: {}, error: '取數失敗' },
    ],
  },
}

const HEALTH_FIXTURE = {
  data: {
    category: 'health',
    params: { date: '2026-08-08' },
    tenants: [
      {
        tenant_id: 1,
        slug: 'yihua',
        name: 'A 校',
        error: null,
        data: {
          staff_expected: 20,
          staff_checked_in: 18,
          staff_missing: 2,
          pending_leaves: 8,
          pending_overtimes: 4,
          pending_total: 12,
          overdue_fee_students: 1,
          overdue_fee_amount: 5000,
          recent_visits_30d: 6,
        },
      },
      {
        tenant_id: 3,
        slug: 'renwu',
        name: 'B 校',
        error: null,
        data: {
          staff_expected: 5,
          staff_checked_in: 5,
          staff_missing: 0,
          pending_leaves: 0,
          pending_overtimes: 0,
          pending_total: 0,
          overdue_fee_students: 0,
          overdue_fee_amount: 0,
          recent_visits_30d: 1,
        },
      },
    ],
    totals: {
      staff_missing: 2,
      pending_total: 12,
      overdue_fee_students: 1,
      overdue_fee_amount: 5000,
      recent_visits_30d: 7,
    },
    generated_at: '2026-08-08T09:00:00',
    cached: false,
  },
}

describe('PlatformOverviewView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetCacheForTesting()
    h.listTenants.mockResolvedValue({ data: { items: TENANTS, total: TENANTS.length } })
    h.getPlatformReport.mockResolvedValue(OVERVIEW_FIXTURE)
  })

  it('卡片牆只放分校，總部（hq）自己不列為一間分校', async () => {
    const w = mount(PlatformOverviewView, { global: { stubs } })
    await flushPromises()

    expect(w.find('[data-testid="tenant-card-2"]').exists()).toBe(true)
    expect(w.find('[data-testid="tenant-card-3"]').exists()).toBe(true)
    expect(w.find('[data-testid="tenant-card-1"]').exists()).toBe(false)
  })

  it('摘要只加總分校（啟用中家數 / 學生 / 員工 / 待補設定）', async () => {
    const w = mount(PlatformOverviewView, { global: { stubs } })
    await flushPromises()

    expect(w.find('[data-testid="summary-active"]').text()).toBe('1')
    expect(w.find('[data-testid="summary-students"]').text()).toBe('120')
    expect(w.find('[data-testid="summary-employees"]').text()).toBe('15')
    // B 校沒有 public_origin → 列為待補
    expect(w.find('[data-testid="summary-onboarding"]').text()).toBe('1')
  })

  it('單校報表失敗只影響那張卡片', async () => {
    const w = mount(PlatformOverviewView, { global: { stubs } })
    await flushPromises()

    expect(w.find('[data-testid="tenant-card-error-3"]').text()).toContain('取數失敗')
    expect(w.find('[data-testid="tenant-card-error-2"]').exists()).toBe(false)
    expect(w.find('[data-testid="overview-error"]').exists()).toBe(false)
  })

  it('渲染營運健康區塊並依閾值標警示', async () => {
    h.getPlatformReport.mockImplementation((category: string) =>
      Promise.resolve(category === 'health' ? HEALTH_FIXTURE : OVERVIEW_FIXTURE),
    )
    const w = mount(PlatformOverviewView, { global: { stubs } })
    await flushPromises()
    const health = w.find('[data-testid="health-panel"]')
    expect(health.exists()).toBe(true)
    expect(health.text()).toContain('A 校')
    const warnCells = health.findAll('.health-cell--warn')
    // A 校：缺打卡 2 > 0、待簽 12 > 10、逾期 1 > 0 → 3 格警示；B 校 0 格
    expect(warnCells.length).toBe(3)
  })

  it('健康面板手動刷新會 force refresh', async () => {
    h.getPlatformReport.mockImplementation((category: string) =>
      Promise.resolve(category === 'health' ? HEALTH_FIXTURE : OVERVIEW_FIXTURE),
    )
    const w = mount(PlatformOverviewView, { global: { stubs } })
    await flushPromises()
    const calls = h.getPlatformReport.mock.calls.length
    await w.find('[data-testid="health-refresh"]').trigger('click')
    await flushPromises()
    expect(h.getPlatformReport.mock.calls.length).toBeGreaterThan(calls)
  })

  it('健康面板取數失敗要顯示錯誤，不能偽裝成「尚無資料」', async () => {
    h.getPlatformReport.mockImplementation((category: string) =>
      category === 'health'
        ? Promise.reject(new Error('取數失敗'))
        : Promise.resolve(OVERVIEW_FIXTURE),
    )
    const w = mount(PlatformOverviewView, { global: { stubs } })
    await flushPromises()

    const health = w.find('[data-testid="health-panel"]')
    expect(w.find('[data-testid="health-error"]').exists()).toBe(true)
    expect(health.text()).not.toContain('尚無資料')
  })
})
