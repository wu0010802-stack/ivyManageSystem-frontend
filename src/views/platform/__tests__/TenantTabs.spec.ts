/**
 * 分校詳情的兩個高風險分頁：
 *  - 品牌（onboarding）：只送有改的 key，清空＝送 `null`（刪 key、回退前端預設值），
 *    **不是**送空字串把預設值蓋成空白（DEV-18 的核心理由）。
 *  - LINE 憑證：畫面上永遠沒有明文可回填，因此「留空 = 不變更」；若把空字串一起送出，
 *    按一次儲存就會把既有 token 洗掉。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  getTenantBrand: vi.fn(),
  updateTenantBrand: vi.fn(),
  getTenantLineConfig: vi.fn(),
  updateTenantLineConfig: vi.fn(),
  getTenantEmailConfig: vi.fn(),
  updateTenantEmailConfig: vi.fn(),
}))

vi.mock('@/api/platform', () => ({
  getTenantBrand: h.getTenantBrand,
  updateTenantBrand: h.updateTenantBrand,
  getTenantLineConfig: h.getTenantLineConfig,
  updateTenantLineConfig: h.updateTenantLineConfig,
  getTenantEmailConfig: h.getTenantEmailConfig,
  updateTenantEmailConfig: h.updateTenantEmailConfig,
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn(), prompt: vi.fn() },
}))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))

import TenantBrandTab from '../TenantBrandTab.vue'
import TenantEmailTab from '../TenantEmailTab.vue'
import TenantLineTab from '../TenantLineTab.vue'

const stubs = {
  'el-alert': { props: ['title'], template: '<div class="el-alert">{{ title }}<slot /></div>' },
  'el-button': {
    props: ['disabled', 'loading', 'type'],
    template: '<button :disabled="disabled"><slot /></button>',
  },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { props: ['label'], template: '<div><label>{{ label }}</label><slot /></div>' },
  'el-input': {
    props: ['modelValue'],
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  'el-switch': { props: ['modelValue'], template: '<input type="checkbox" />' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-descriptions': { template: '<dl><slot /></dl>' },
  'el-descriptions-item': { props: ['label'], template: '<div><dt>{{ label }}</dt><dd><slot /></dd></div>' },
}

describe('TenantBrandTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.getTenantBrand.mockResolvedValue({
      data: {
        tenant_id: 2,
        known_keys: ['brand.short_name', 'brand.titles.admin', 'brand.share.og_title'],
        missing_keys: ['brand.share.og_title'],
        values: { 'brand.short_name': '常春藤', 'brand.titles.admin': '管理後台', 'brand.share.og_title': null },
      },
    })
    h.updateTenantBrand.mockResolvedValue({
      data: { tenant_id: 2, known_keys: [], missing_keys: [], values: {} },
    })
  })

  const mountTab = () => mount(TenantBrandTab, { props: { tenantId: 2 }, global: { stubs } })

  it('列出全部 key、標出未填者', async () => {
    const w = mountTab()
    await flushPromises()
    expect(w.find('[data-testid="brand-missing"]').text()).toContain('1')
    expect(w.find('[data-testid="brand-input-brand.short_name"]').exists()).toBe(true)
  })

  it('沒有變更時儲存鍵 disabled', async () => {
    const w = mountTab()
    await flushPromises()
    expect((w.find('[data-testid="brand-save"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('只送有改的 key；清空的欄位送 null 而非空字串', async () => {
    const w = mountTab()
    await flushPromises()

    await w.find('[data-testid="brand-input-brand.share.og_title"]').setValue('招生中')
    await w.find('[data-testid="brand-input-brand.titles.admin"]').setValue('')
    await w.find('[data-testid="brand-save"]').trigger('click')
    await flushPromises()

    expect(h.updateTenantBrand).toHaveBeenCalledWith(2, {
      values: { 'brand.titles.admin': null, 'brand.share.og_title': '招生中' },
    })
    // 未變更的 short_name 不在 payload 內
    const payload = h.updateTenantBrand.mock.calls[0][1] as { values: Record<string, unknown> }
    expect(Object.keys(payload.values)).not.toContain('brand.short_name')
  })
})

describe('TenantLineTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.getTenantLineConfig.mockResolvedValue({
      data: {
        tenant_id: 2,
        is_enabled: true,
        channel_access_token_masked: '••••1234',
        channel_secret_masked: '••••abcd',
        liff_id: '1660-xxxx',
        target_id: null,
        updated_at: '2026-08-04',
      },
    })
    h.updateTenantLineConfig.mockResolvedValue({ data: { tenant_id: 2, is_enabled: true } })
  })

  const mountTab = () => mount(TenantLineTab, { props: { tenantId: 2 }, global: { stubs } })

  it('憑證只顯示遮罩值，不會有明文出現在畫面上', async () => {
    const w = mountTab()
    await flushPromises()
    expect(w.find('[data-testid="line-token-masked"]').text()).toBe('••••1234')
    // 表單的憑證欄一律留空（沒有明文可回填）
    expect((w.find('[data-testid="line-form-token"]').element as HTMLInputElement).value).toBe('')
  })

  it('留空的憑證欄不進 payload（按儲存不會把既有 token 洗成空值）', async () => {
    const w = mountTab()
    await flushPromises()

    await w.find('[data-testid="line-form-liff"]').setValue('1660-new')
    await w.find('[data-testid="line-save"]').trigger('click')
    await flushPromises()

    expect(h.updateTenantLineConfig).toHaveBeenCalledWith(2, { is_enabled: true, liff_id: '1660-new' })
    const payload = h.updateTenantLineConfig.mock.calls[0][1] as Record<string, unknown>
    expect(payload).not.toHaveProperty('channel_access_token')
    expect(payload).not.toHaveProperty('channel_secret')
  })
})

describe('TenantEmailTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.getTenantEmailConfig.mockResolvedValue({
      data: {
        tenant_id: 2,
        is_enabled: true,
        from_name: '仁武幼兒園',
        from_address: 'noreply@example.tw',
        resend_api_key_masked: '••••1234',
        updated_at: '2026-08-07',
      },
    })
    h.updateTenantEmailConfig.mockResolvedValue({ data: { tenant_id: 2, is_enabled: true } })
  })

  const mountTab = () => mount(TenantEmailTab, { props: { tenantId: 2 }, global: { stubs } })

  it('憑證只顯示遮罩值，不會有明文出現在畫面上', async () => {
    const w = mountTab()
    await flushPromises()
    expect(w.find('[data-testid="email-key-masked"]').text()).toBe('••••1234')
    expect(w.find('[data-testid="email-from-name"]').text()).toBe('仁武幼兒園')
    // 表單的憑證欄一律留空（沒有明文可回填）
    expect((w.find('[data-testid="email-form-key"]').element as HTMLInputElement).value).toBe('')
  })

  it('留空的憑證欄不進 payload（按儲存不會把既有 API Key 洗成空值）', async () => {
    const w = mountTab()
    await flushPromises()

    await w.find('[data-testid="email-form-from-name"]').setValue('仁武幼兒園（更新）')
    await w.find('[data-testid="email-save"]').trigger('click')
    await flushPromises()

    expect(h.updateTenantEmailConfig).toHaveBeenCalledWith(2, {
      is_enabled: true,
      from_name: '仁武幼兒園（更新）',
      // 非憑證欄位（from_address）本來就有值，儲存時照既有值一併送出——
      // 跟 TenantLineTab 的 line_login_channel_id/liff_id 同一套語意，
      // 「留空 = 不變更」只保護憑證欄（resend_api_key）。
      from_address: 'noreply@example.tw',
    })
    const payload = h.updateTenantEmailConfig.mock.calls[0][1] as Record<string, unknown>
    expect(payload).not.toHaveProperty('resend_api_key')
  })
})
