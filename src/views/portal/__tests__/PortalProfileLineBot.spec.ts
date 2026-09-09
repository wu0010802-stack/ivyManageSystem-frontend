import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'

const { fetchTenantMetaForLine, qrToDataURL } = vi.hoisted(() => ({
  fetchTenantMetaForLine: vi.fn(),
  qrToDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,mock')),
}))

vi.mock('@/api/tenantMeta', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/tenantMeta')>()
  return { ...actual, fetchTenantMetaForLine }
})

vi.mock('@/composables/useTenantBranding', () => ({
  useTenantBranding: () => ({ branding: { value: { line_bot_friend_url: '' } } }),
}))

vi.mock('@/composables/useIsMobile', () => ({
  useIsMobile: () => ({ isMobile: { value: false }, cleanup: () => {} }),
}))

vi.mock('@/composables/useErrorNotify', () => ({
  useErrorNotify: () => ({ notify: vi.fn() }),
}))

vi.mock('qrcode', () => ({ default: { toDataURL: qrToDataURL } }))

vi.mock('@/api/lineBinding', () => ({
  getMyLineBinding: vi.fn(() => Promise.resolve({ data: { line_user_id: null } })),
  updateMyLineBinding: vi.fn(),
  deleteMyLineBinding: vi.fn(),
}))

vi.mock('@/api/portal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/portal')>()
  return {
    ...actual,
    getProfile: vi.fn(() => Promise.resolve({ data: {} })),
    updateProfile: vi.fn(),
    setPunchPin: vi.fn(),
  }
})

import { TenantMetaError } from '@/api/tenantMeta'
import { _resetTenantCacheForTests } from '@/utils/tenant'
import PortalProfileView from '../PortalProfileView.vue'

const ORIGINAL_ENV = { ...import.meta.env }
const setEnv = (patch: Record<string, string>) => Object.assign(import.meta.env, patch)

beforeEach(() => {
  fetchTenantMetaForLine.mockReset()
  qrToDataURL.mockClear()
  setEnv({
    VITE_LINE_BOT_FRIEND_URL: 'https://line.me/R/ti/p/@default-school',
    VITE_TENANT_META_ENABLED: '',
    VITE_TENANT_BASE_DOMAIN: '',
    VITE_TENANT_DOMAIN_MAP: '',
  })
  _resetTenantCacheForTests()
})

afterEach(() => {
  Object.assign(import.meta.env, ORIGINAL_ENV)
  _resetTenantCacheForTests()
})

async function mountView() {
  const wrapper = mount(PortalProfileView, { global: { plugins: [ElementPlus] } })
  await flushPromises()
  return wrapper
}

describe('PortalProfileView 教師 LINE 官方帳號連結', () => {
  it('tenant-meta 回傳該租戶連結時，只使用 runtime 連結產生按鈕與 QR', async () => {
    fetchTenantMetaForLine.mockResolvedValue({
      tenant: { slug: 'renwu' },
      line_bot_friend_url: 'https://line.me/R/ti/p/@renwu-school',
    })

    const wrapper = await mountView()

    expect(wrapper.find('a[href="https://line.me/R/ti/p/@renwu-school"]').exists()).toBe(true)
    expect(wrapper.find('a[href="https://line.me/R/ti/p/@default-school"]').exists()).toBe(false)
    expect(qrToDataURL).toHaveBeenCalledWith(
      'https://line.me/R/ti/p/@renwu-school',
      expect.any(Object),
    )
  })

  it('tenant-meta 已識別租戶但連結為空時，不退回 default tenant env', async () => {
    fetchTenantMetaForLine.mockResolvedValue({ tenant: { slug: 'renwu' }, line_bot_friend_url: '' })

    const wrapper = await mountView()

    expect(wrapper.find('.line-bind-actions').exists()).toBe(false)
    expect(wrapper.find('.line-bot-url-missing').exists()).toBe(true)
    expect(qrToDataURL).not.toHaveBeenCalled()
  })

  it.each([
    [404, 'TENANT_NOT_FOUND'],
    [403, 'TENANT_SUSPENDED'],
    [503, 'TENANT_PROVISIONING'],
  ])('tenant-meta %i 租戶錯誤時不退回 default tenant env', async (status, code) => {
    fetchTenantMetaForLine.mockRejectedValue(new TenantMetaError(status, code))

    const wrapper = await mountView()

    expect(wrapper.find('.line-bind-actions').exists()).toBe(false)
    expect(wrapper.find('.line-bot-url-missing').exists()).toBe(true)
    expect(qrToDataURL).not.toHaveBeenCalled()
  })

  it('只有單租戶 legacy 後端明確缺 tenant-meta 路由時才沿用 env', async () => {
    fetchTenantMetaForLine.mockRejectedValue(
      Object.assign(new TenantMetaError(404), { legacyRouteMissing: true }),
    )

    const wrapper = await mountView()

    expect(wrapper.find('a[href="https://line.me/R/ti/p/@default-school"]').exists()).toBe(true)
    expect(qrToDataURL).toHaveBeenCalledWith(
      'https://line.me/R/ti/p/@default-school',
      expect.any(Object),
    )
  })
})
