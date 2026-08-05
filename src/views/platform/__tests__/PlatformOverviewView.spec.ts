/**
 * 總部總覽：分校卡片牆 + 月度指標。報表單校失敗時只標那一張卡片，不拖垮整頁。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

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
}

describe('PlatformOverviewView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetCacheForTesting()
    h.listTenants.mockResolvedValue({ data: { items: TENANTS, total: TENANTS.length } })
    h.getPlatformReport.mockResolvedValue({
      data: {
        category: 'platform_overview',
        params: {},
        totals: {},
        tenants: [
          { tenant_id: 2, slug: 'branch-a', name: 'A 校', data: { student_count: 100 }, error: null },
          { tenant_id: 3, slug: 'branch-b', name: 'B 校', data: {}, error: '取數失敗' },
        ],
      },
    })
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
})
