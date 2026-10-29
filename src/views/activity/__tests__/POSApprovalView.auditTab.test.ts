/**
 * POS 收款簽核的「稽核軌跡」頁籤（後台 IA 重整 M5）：
 * 原獨立頁 /activity/audit/pos-unlock 併入，?tab=audit 與網址同步，gate 為 ACTIVITY_PAYMENT_APPROVE。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'

vi.mock('@/api/activity', () => ({
  approvePOSDailyClose: vi.fn(() => Promise.resolve({ data: { warnings: [] } })),
  getPOSDailyClosePending: vi.fn(() => Promise.resolve({ data: { pending: [] } })),
  getPOSDailyCloseStatus: vi.fn(() => Promise.resolve({ data: { status: 'pending', by_method: {} } })),
  getPOSReconciliation: vi.fn(() => Promise.resolve({ data: { items: [], totals: {} } })),
  getPOSRecentTransactions: vi.fn(() => Promise.resolve({ data: { transactions: [] } })),
  unlockPOSDailyClose: vi.fn(() => Promise.resolve({ data: {} })),
}))

const granted = vi.hoisted(() => new Set<string>())
vi.mock('@/utils/auth', () => ({
  hasPermission: (code: string) => granted.has(code),
  getUserInfo: vi.fn(() => ({ username: 'boss', role: 'admin' })),
}))

const replaceMock = vi.fn()
const route = reactive<{ query: Record<string, string> }>({ query: {} })
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace: replaceMock }),
}))

vi.mock('element-plus', () => ({
  ElMessage: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
  ElMessageBox: { confirm: vi.fn(() => Promise.resolve()), alert: vi.fn() },
}))

// 稽核頁本體另有自己的職責，這裡只驗它以 embedded 嵌入
vi.mock('@/views/activity/POSAuditEventsView.vue', () => ({
  default: {
    name: 'POSAuditEventsView',
    props: { embedded: Boolean },
    template: '<div data-test="audit-view" :data-embedded="String(embedded)" />',
  },
}))

import POSApprovalView from '@/views/activity/POSApprovalView.vue'

const STUBS = {
  PageHeader: true,
  POSSemesterReconciliation: true,
  StatCard: true,
  AdminListToolbar: true,
  'el-tabs': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<div data-test="tabs" :data-active="modelValue"><slot /></div>',
  },
  'el-tab-pane': {
    props: ['label', 'name'],
    template: '<section data-test="pane" :data-name="name" :data-label="label"><slot /></section>',
  },
  'el-card': { template: '<div><slot name="header" /><slot /></div>' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<label><slot /></label>' },
  'el-input': { template: '<input />' },
  'el-input-number': { template: '<input />' },
  'el-button': { template: '<button><slot /></button>' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-date-picker': { template: '<input />' },
  'el-table': { template: '<div />' },
  'el-table-column': { template: '<div />' },
  'el-alert': { template: '<div />' },
  'el-icon': { template: '<span />' },
  'el-empty': { template: '<div />' },
}

const mountView = () => mount(POSApprovalView, { global: { stubs: STUBS } })
const vmOf = (w: ReturnType<typeof mountView>) => w.vm as unknown as { activeTab: string }
const paneNames = (w: ReturnType<typeof mountView>) =>
  w.findAll('[data-test="pane"]').map((p) => p.attributes('data-name'))

describe('POSApprovalView 稽核軌跡頁籤', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    route.query = {}
    granted.clear()
    granted.add('ACTIVITY_PAYMENT_APPROVE')
  })

  it('有簽核權限：多一個「稽核軌跡」頁籤，內嵌稽核頁（embedded）；頁首不再有跳轉按鈕', async () => {
    const w = mountView()
    await flushPromises()
    expect(paneNames(w)).toEqual(['daily', 'semester', 'audit'])
    expect(w.find('[data-name="audit"]').attributes('data-label')).toBe('稽核軌跡')
    expect(w.find('[data-test="audit-view"]').attributes('data-embedded')).toBe('true')
    expect(w.text()).not.toContain('異常稽核軌跡')
  })

  it('沒有 ACTIVITY_PAYMENT_APPROVE：不渲染稽核軌跡頁籤，?tab=audit 落回日結簽核', async () => {
    granted.clear()
    route.query = { tab: 'audit' }
    const w = mountView()
    await flushPromises()
    expect(paneNames(w)).toEqual(['daily', 'semester'])
    expect(w.find('[data-test="audit-view"]').exists()).toBe(false)
    expect(vmOf(w).activeTab).toBe('daily')
  })

  it('?tab=audit（/activity/audit/pos-unlock 舊網址 redirect 落點）直接開稽核軌跡頁籤', async () => {
    route.query = { tab: 'audit' }
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-test="tabs"]').attributes('data-active')).toBe('audit')
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('?tab=semester 開學期對帳；無效值 fallback 日結簽核', async () => {
    route.query = { tab: 'semester' }
    expect(vmOf(mountView()).activeTab).toBe('semester')
    route.query = { tab: 'nope' }
    expect(vmOf(mountView()).activeTab).toBe('daily')
  })

  it('切頁籤回寫 ?tab= 並保留其他 query；回日結簽核則移除 tab', async () => {
    route.query = { foo: 'bar' }
    const w = mountView()
    await flushPromises()
    vmOf(w).activeTab = 'audit'
    await flushPromises()
    expect(replaceMock).toHaveBeenLastCalledWith({ query: { foo: 'bar', tab: 'audit' } })

    route.query = { foo: 'bar', tab: 'audit' } // 模擬 router.replace 已生效
    await flushPromises()
    vmOf(w).activeTab = 'daily'
    await flushPromises()
    expect(replaceMock).toHaveBeenLastCalledWith({ query: { foo: 'bar' } })
  })
})
