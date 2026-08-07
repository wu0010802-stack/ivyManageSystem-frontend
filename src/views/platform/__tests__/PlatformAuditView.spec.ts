/**
 * 跨分校稽核頁：`tenant_id` 必填、預設單一分校（pin，不告警）；切「全租戶」是
 * 顯式 opt-in 且必須二次確認——那條路徑會刻意產生一則高風險稽核告警（CT-P-07）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  listTenants: vi.fn(),
  getPlatformAudit: vi.fn(),
  confirm: vi.fn(),
}))

vi.mock('@/api/platform', () => ({
  listTenants: h.listTenants,
  getPlatformAudit: h.getPlatformAudit,
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: h.confirm, prompt: vi.fn() },
}))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))

import { _resetCacheForTesting } from '@/composables/useCachedAsync'
import PlatformAuditView from '../PlatformAuditView.vue'

const TENANTS = [
  { id: 2, slug: 'branch-a', name: 'A 校', kind: 'school', status: 'active' },
  { id: 3, slug: 'branch-b', name: 'B 校', kind: 'school', status: 'active' },
]

const PAGE = {
  items: [
    { id: 1, action: 'UPDATE', entity_type: 'student', entity_id: '7', username: 'admin', tenant_slug: 'branch-a', created_at: '2026-08-04 10:00', summary: '修改學生', ip_address: '10.0.0.1' },
  ],
  total: 1,
  page: 1,
  page_size: 50,
  cross_tenant: false,
}

const stubs = {
  PageHeader: { template: '<div><slot name="filters" /></div>' },
  EmptyState: { template: '<div class="empty" />' },
  'el-alert': { props: ['title'], template: '<div class="el-alert">{{ title }}<slot /></div>' },
  'el-button': { props: ['loading', 'type'], template: '<button><slot /></button>' },
  'el-select': { props: ['modelValue'], template: '<select><slot /></select>' },
  'el-option': { template: '<option />' },
  'el-input': { props: ['modelValue'], template: '<input :value="modelValue" />' },
  'el-date-picker': { props: ['modelValue'], template: '<input />' },
  'el-table': {
    props: ['data'],
    template: '<table><tbody><tr v-for="r in data" :key="r.id"><td>{{ r.summary }}</td></tr></tbody></table>',
  },
  'el-table-column': { template: '<span />' },
  'el-pagination': { props: ['total'], template: '<div class="pagination" />' },
}

interface Vm {
  tenantChoice: string
  onTenantChange: (v: string) => Promise<void>
  search: () => Promise<void>
}

async function mountReady() {
  const w = mount(PlatformAuditView, { global: { stubs } })
  await flushPromises()
  return { w, vm: w.vm as unknown as Vm }
}

describe('PlatformAuditView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetCacheForTesting()
    h.listTenants.mockResolvedValue({ data: { items: TENANTS, total: TENANTS.length } })
    h.getPlatformAudit.mockResolvedValue({ data: PAGE })
    h.confirm.mockResolvedValue('ok')
  })

  it('進頁自動選第一間分校並以 tenant_id=<id> 查詢（必填參數不得留空）', async () => {
    const { w } = await mountReady()
    expect(h.getPlatformAudit).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: '2' }))
    expect(w.find('[data-testid="audit-table"]').text()).toContain('修改學生')
    // 單一分校模式不顯示高風險警語
    expect(w.find('[data-testid="audit-cross-warning"]').exists()).toBe(false)
  })

  it('切換到「全部租戶」需二次確認，確認後以 tenant_id=all 查詢並顯示告警提示', async () => {
    const { w, vm } = await mountReady()
    h.getPlatformAudit.mockClear()

    vm.tenantChoice = 'all'
    await vm.onTenantChange('all')
    await flushPromises()

    expect(h.confirm).toHaveBeenCalled()
    expect(h.getPlatformAudit).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: 'all' }))
    expect(w.find('[data-testid="audit-cross-warning"]').exists()).toBe(true)
  })

  it('確認框被取消 → 退回第一間分校，且不發出全租戶查詢', async () => {
    const { w, vm } = await mountReady()
    h.getPlatformAudit.mockClear()
    h.confirm.mockRejectedValueOnce(new Error('cancel'))

    vm.tenantChoice = 'all'
    await vm.onTenantChange('all')
    await flushPromises()

    expect(h.getPlatformAudit).not.toHaveBeenCalled()
    expect(vm.tenantChoice).toBe('2')
    expect(w.find('[data-testid="audit-cross-warning"]').exists()).toBe(false)
  })

  it('查詢失敗顯示錯誤訊息且清空列表（不留上一批資料）', async () => {
    const { w, vm } = await mountReady()
    h.getPlatformAudit.mockRejectedValueOnce({ displayMessage: '沒有權限' })
    await vm.search()
    await flushPromises()

    expect(w.find('[data-testid="audit-error"]').text()).toContain('沒有權限')
    expect(w.find('[data-testid="audit-table"]').text()).not.toContain('修改學生')
  })
})
