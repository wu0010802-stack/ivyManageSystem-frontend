/**
 * 分校詳情頁：進入某分校 = 切換 acting tenant，必須推進管理端身分世代（CT-A-06），
 * 否則上一校的 in-flight 回應會落在這一校畫面上。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  getTenant: vi.fn(),
  suspendTenant: vi.fn(),
  resumeTenant: vi.fn(),
  setActingTenant: vi.fn(),
  routeParams: { id: '2' } as { id: string },
}))

vi.mock('@/api/platform', () => ({
  getTenant: h.getTenant,
  suspendTenant: h.suspendTenant,
  resumeTenant: h.resumeTenant,
}))
vi.mock('@/composables/useActingTenant', () => ({
  setActingTenant: h.setActingTenant,
  platformCacheKey: (base: string) => `hq:test:${base}`,
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({
    get params() {
      return h.routeParams
    },
  }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn().mockResolvedValue('ok'), prompt: vi.fn() },
}))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))

import PlatformTenantDetailView from '../PlatformTenantDetailView.vue'

const DETAIL = {
  id: 2,
  slug: 'branch-a',
  name: 'A 校',
  display_name: 'A 分校',
  kind: 'school',
  status: 'active',
  public_origin: 'https://a.example.tw',
  missing_config_keys: [],
  missing_brand_keys: ['brand.share.og_title'],
  system_roles_ok: true,
}

const stubs = {
  PageHeader: { template: '<div><slot name="title-extra" /><slot name="actions" /></div>' },
  TenantBasicTab: { template: '<div class="basic-tab" />' },
  TenantBrandTab: { template: '<div class="brand-tab" />' },
  TenantLineTab: { template: '<div class="line-tab" />' },
  TenantEmailTab: { template: '<div class="email-tab" />' },
  'el-alert': { props: ['title'], template: '<div class="el-alert">{{ title }}</div>' },
  'el-button': { props: ['loading', 'type'], template: '<button><slot /></button>' },
  'el-tabs': { props: ['modelValue'], template: '<div><slot /></div>' },
  'el-tab-pane': { props: ['label', 'name'], template: '<section><slot /></section>' },
  'el-tag': { template: '<span><slot /></span>' },
}

describe('PlatformTenantDetailView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.routeParams = { id: '2' }
    h.getTenant.mockResolvedValue({ data: DETAIL })
  })

  it('載入分校後把它設為 acting tenant（帶 public_origin 供組登入連結）', async () => {
    mount(PlatformTenantDetailView, { global: { stubs } })
    await flushPromises()

    expect(h.getTenant).toHaveBeenCalledWith(2)
    expect(h.setActingTenant).toHaveBeenCalledWith({
      id: 2,
      slug: 'branch-a',
      name: 'A 分校',
      public_origin: 'https://a.example.tw',
    })
  })

  it('載入失敗顯示錯誤，且不會把失敗的分校設成 acting tenant', async () => {
    h.getTenant.mockRejectedValueOnce({ displayMessage: '找不到分校' })
    const w = mount(PlatformTenantDetailView, { global: { stubs } })
    await flushPromises()

    expect(w.find('[data-testid="detail-error"]').text()).toContain('找不到分校')
    expect(h.setActingTenant).not.toHaveBeenCalled()
  })

  it('網址帶非數字 id 時不打 API（fail-closed）', async () => {
    h.routeParams = { id: 'abc' }
    const w = mount(PlatformTenantDetailView, { global: { stubs } })
    await flushPromises()

    expect(h.getTenant).not.toHaveBeenCalled()
    expect(w.find('[data-testid="detail-error"]').exists()).toBe(true)
  })

  it('停用後重新載入詳情（狀態要即時反映）', async () => {
    h.suspendTenant.mockResolvedValue({ data: { id: 2, slug: 'branch-a', status: 'suspended' } })
    const w = mount(PlatformTenantDetailView, { global: { stubs } })
    await flushPromises()
    h.getTenant.mockResolvedValue({ data: { ...DETAIL, status: 'suspended' } })

    await (w.vm as unknown as { changeStatus: (a: 'suspend' | 'resume') => Promise<void> }).changeStatus('suspend')
    await flushPromises()

    expect(h.suspendTenant).toHaveBeenCalledWith(2)
    expect(h.getTenant).toHaveBeenCalledTimes(2)
    expect(w.find('[data-testid="detail-status"]').text()).toBe('已停用')
  })
})
