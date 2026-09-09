/**
 * 分校詳情的兩個高風險分頁：
 *  - 品牌（onboarding）：只送有改的 key，清空＝送 `null`（刪 key、回退前端預設值），
 *    **不是**送空字串把預設值蓋成空白（DEV-18 的核心理由）。
 *  - LINE 憑證：畫面上永遠沒有明文可回填，因此「留空 = 不變更」；若把空字串一起送出，
 *    按一次儲存就會把既有 token 洗掉。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const h = vi.hoisted(() => ({
  getTenantBrand: vi.fn(),
  updateTenantBrand: vi.fn(),
  getTenantLineConfig: vi.fn(),
  updateTenantLineConfig: vi.fn(),
  getTenantEmailConfig: vi.fn(),
  updateTenantEmailConfig: vi.fn(),
  messageSuccess: vi.fn(),
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
  ElMessage: { success: h.messageSuccess, error: vi.fn(), warning: vi.fn() },
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

  const mountTab = (tenantId = 2) => mount(TenantBrandTab, { props: { tenantId }, global: { stubs } })

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

  it('切到 B 校時立即清除 A 校未儲存品牌值，B 載入失敗後仍禁止儲存', async () => {
    const w = mountTab()
    await flushPromises()
    await w.find('[data-testid="brand-input-brand.short_name"]').setValue('A 校未儲存')

    const bLoad = deferred<{ data: never }>()
    h.getTenantBrand.mockReturnValueOnce(bLoad.promise)
    await w.setProps({ tenantId: 3 })

    expect(w.find('[data-testid="brand-input-brand.short_name"]').exists()).toBe(false)
    expect((w.find('[data-testid="brand-save"]').element as HTMLButtonElement).disabled).toBe(true)

    bLoad.reject({ displayMessage: 'B 校品牌設定載入失敗' })
    await flushPromises()
    await w.find('[data-testid="brand-save"]').trigger('click')
    expect(h.updateTenantBrand).not.toHaveBeenCalled()
  })

  it('A 校較晚回覆時不會覆蓋已載入的 B 校品牌表單', async () => {
    const aLoad = deferred<{
      data: { tenant_id: number; known_keys: string[]; missing_keys: string[]; values: Record<string, string> }
    }>()
    h.getTenantBrand.mockReturnValueOnce(aLoad.promise).mockResolvedValueOnce({
      data: {
        tenant_id: 3,
        known_keys: ['brand.short_name'],
        missing_keys: [],
        values: { 'brand.short_name': 'B 校' },
      },
    })

    const w = mountTab()
    await w.setProps({ tenantId: 3 })
    await flushPromises()
    expect((w.find('[data-testid="brand-input-brand.short_name"]').element as HTMLInputElement).value).toBe('B 校')

    aLoad.resolve({
      data: {
        tenant_id: 2,
        known_keys: ['brand.short_name'],
        missing_keys: [],
        values: { 'brand.short_name': 'A 校' },
      },
    })
    await flushPromises()
    expect((w.find('[data-testid="brand-input-brand.short_name"]').element as HTMLInputElement).value).toBe('B 校')
  })

  it('A 校儲存中切到 B 校時，A 回覆不會覆蓋 B，B 儲存只送 B payload', async () => {
    const w = mountTab()
    await flushPromises()
    await w.find('[data-testid="brand-input-brand.short_name"]').setValue('A 校未儲存')

    const aSave = deferred<{
      data: { tenant_id: number; known_keys: string[]; missing_keys: string[]; values: Record<string, string> }
    }>()
    h.updateTenantBrand.mockReturnValueOnce(aSave.promise)
    await w.find('[data-testid="brand-save"]').trigger('click')

    h.getTenantBrand.mockResolvedValueOnce({
      data: {
        tenant_id: 3,
        known_keys: ['brand.short_name'],
        missing_keys: [],
        values: { 'brand.short_name': 'B 校' },
      },
    })
    await w.setProps({ tenantId: 3 })
    await flushPromises()

    aSave.resolve({
      data: {
        tenant_id: 2,
        known_keys: ['brand.short_name'],
        missing_keys: [],
        values: { 'brand.short_name': 'A 校已儲存' },
      },
    })
    await flushPromises()
    expect((w.find('[data-testid="brand-input-brand.short_name"]').element as HTMLInputElement).value).toBe('B 校')

    h.updateTenantBrand.mockResolvedValueOnce({
      data: { tenant_id: 3, known_keys: [], missing_keys: [], values: { 'brand.short_name': 'B 校更新' } },
    })
    await w.find('[data-testid="brand-input-brand.short_name"]').setValue('B 校更新')
    await w.find('[data-testid="brand-save"]').trigger('click')
    await flushPromises()
    expect(h.updateTenantBrand).toHaveBeenLastCalledWith(3, { values: { 'brand.short_name': 'B 校更新' } })
  })

  it('A 校儲存回覆晚於分頁卸載時不顯示成功訊息', async () => {
    const w = mountTab()
    await flushPromises()
    await w.find('[data-testid="brand-input-brand.short_name"]').setValue('A 校未儲存')
    const pendingSave = deferred<{ data: { tenant_id: number; missing_keys: string[]; values: Record<string, string> } }>()
    h.updateTenantBrand.mockReturnValueOnce(pendingSave.promise)
    await w.find('[data-testid="brand-save"]').trigger('click')

    w.unmount()
    pendingSave.resolve({ data: { tenant_id: 2, missing_keys: [], values: { 'brand.short_name': 'A 校' } } })
    await flushPromises()
    expect(h.messageSuccess).not.toHaveBeenCalled()
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

  const mountTab = (tenantId = 2) => mount(TenantLineTab, { props: { tenantId }, global: { stubs } })

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

  /**
   * SPEC-020 CT-M-05：家長端載體改為 LINE MINI App 後，`line_login_channel_id`
   * 與 `liff_id` 兩欄的語意變了但欄名沒變（避免一支純改名的 migration）。
   * 這條警告是畫面上唯一阻止維運者填回舊 LINE Login channel ID 的東西——
   * 填錯的後果是全體家長登入 401，且症狀（aud 不符）不會指向設定頁。
   * 因此它是功能的一部分，不是裝飾，刪掉要先看到這個測試紅。
   */
  it('必須顯示 MINI App 填值警告，並點出 Provider 與環境對應', async () => {
    const w = mountTab()
    await flushPromises()

    const notice = w.find('[data-testid="line-miniapp-notice"]')
    expect(notice.exists()).toBe(true)

    const text = notice.text()
    expect(text).toContain('MINI App')
    // 填錯 channel 的後果
    expect(text).toContain('登入失敗')
    // 建立時就決定、事後無法補救的前提
    expect(text).toContain('同一個 Provider')
    // 三個內部 channel 的 LIFF ID 各不相同
    expect(text).toContain('Published')
    expect(text).toContain('Developing')
  })

  it('切到 B 校時立即清除 A 校未儲存憑證，B 載入失敗後仍禁止儲存', async () => {
    const w = mountTab()
    await flushPromises()
    await w.find('[data-testid="line-form-token"]').setValue('tenant-a-secret')

    const bLoad = deferred<{ data: never }>()
    h.getTenantLineConfig.mockReturnValueOnce(bLoad.promise)
    await w.setProps({ tenantId: 3 })

    expect((w.find('[data-testid="line-form-token"]').element as HTMLInputElement).value).toBe('')
    expect((w.find('[data-testid="line-save"]').element as HTMLButtonElement).disabled).toBe(true)

    bLoad.reject({ displayMessage: 'B 校 LINE 設定載入失敗' })
    await flushPromises()
    await w.find('[data-testid="line-save"]').trigger('click')
    expect(h.updateTenantLineConfig).not.toHaveBeenCalled()
  })

  it('A 校較晚回覆時不會覆蓋已載入的 B 校表單', async () => {
    const aLoad = deferred<{ data: { tenant_id: number; is_enabled: boolean; liff_id: string } }>()
    h.getTenantLineConfig
      .mockReturnValueOnce(aLoad.promise)
      .mockResolvedValueOnce({ data: { tenant_id: 3, is_enabled: false, liff_id: 'tenant-b-liff' } })

    const w = mountTab()
    await w.setProps({ tenantId: 3 })
    await flushPromises()
    expect((w.find('[data-testid="line-form-liff"]').element as HTMLInputElement).value).toBe('tenant-b-liff')

    aLoad.resolve({ data: { tenant_id: 2, is_enabled: true, liff_id: 'tenant-a-liff' } })
    await flushPromises()
    expect((w.find('[data-testid="line-form-liff"]').element as HTMLInputElement).value).toBe('tenant-b-liff')
  })

  it('A 校儲存中切到 B 校時，A 回覆不會覆蓋 B，B 儲存只送 B payload', async () => {
    const w = mountTab()
    await flushPromises()
    await w.find('[data-testid="line-form-liff"]').setValue('tenant-a-unsaved')

    const aSave = deferred<{ data: { tenant_id: number; is_enabled: boolean; liff_id: string } }>()
    h.updateTenantLineConfig.mockReturnValueOnce(aSave.promise)
    await w.find('[data-testid="line-save"]').trigger('click')

    h.getTenantLineConfig.mockResolvedValueOnce({
      data: { tenant_id: 3, is_enabled: false, liff_id: 'tenant-b-original' },
    })
    await w.setProps({ tenantId: 3 })
    await flushPromises()

    aSave.resolve({ data: { tenant_id: 2, is_enabled: true, liff_id: 'tenant-a-saved' } })
    await flushPromises()
    expect((w.find('[data-testid="line-form-liff"]').element as HTMLInputElement).value).toBe('tenant-b-original')

    h.updateTenantLineConfig.mockResolvedValueOnce({ data: { tenant_id: 3, is_enabled: false } })
    await w.find('[data-testid="line-form-liff"]').setValue('tenant-b-new')
    await w.find('[data-testid="line-save"]').trigger('click')
    await flushPromises()
    expect(h.updateTenantLineConfig).toHaveBeenLastCalledWith(3, {
      is_enabled: false,
      liff_id: 'tenant-b-new',
    })
  })

  it('A 校儲存回覆晚於分頁卸載時不顯示成功訊息', async () => {
    const w = mountTab()
    await flushPromises()
    await w.find('[data-testid="line-form-liff"]').setValue('tenant-a-unsaved')
    const pendingSave = deferred<{ data: { tenant_id: number; is_enabled: boolean; liff_id: string } }>()
    h.updateTenantLineConfig.mockReturnValueOnce(pendingSave.promise)
    await w.find('[data-testid="line-save"]').trigger('click')

    w.unmount()
    pendingSave.resolve({ data: { tenant_id: 2, is_enabled: true, liff_id: 'tenant-a-saved' } })
    await flushPromises()
    expect(h.messageSuccess).not.toHaveBeenCalled()
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

  const mountTab = (tenantId = 2) => mount(TenantEmailTab, { props: { tenantId }, global: { stubs } })

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

  it('切到 B 校時立即清除 A 校未儲存 API Key，B 載入失敗後仍禁止儲存', async () => {
    const w = mountTab()
    await flushPromises()
    await w.find('[data-testid="email-form-key"]').setValue('tenant-a-secret')

    const bLoad = deferred<{ data: never }>()
    h.getTenantEmailConfig.mockReturnValueOnce(bLoad.promise)
    await w.setProps({ tenantId: 3 })

    expect((w.find('[data-testid="email-form-key"]').element as HTMLInputElement).value).toBe('')
    expect((w.find('[data-testid="email-save"]').element as HTMLButtonElement).disabled).toBe(true)

    bLoad.reject({ displayMessage: 'B 校 Email 設定載入失敗' })
    await flushPromises()
    await w.find('[data-testid="email-save"]').trigger('click')
    expect(h.updateTenantEmailConfig).not.toHaveBeenCalled()
  })

  it('A 校較晚回覆時不會覆蓋已載入的 B 校表單', async () => {
    const aLoad = deferred<{
      data: { tenant_id: number; is_enabled: boolean; from_name: string; from_address: string }
    }>()
    h.getTenantEmailConfig.mockReturnValueOnce(aLoad.promise).mockResolvedValueOnce({
      data: { tenant_id: 3, is_enabled: false, from_name: 'B 校', from_address: 'b@example.tw' },
    })

    const w = mountTab()
    await w.setProps({ tenantId: 3 })
    await flushPromises()
    expect((w.find('[data-testid="email-form-from-name"]').element as HTMLInputElement).value).toBe('B 校')

    aLoad.resolve({
      data: { tenant_id: 2, is_enabled: true, from_name: 'A 校', from_address: 'a@example.tw' },
    })
    await flushPromises()
    expect((w.find('[data-testid="email-form-from-name"]').element as HTMLInputElement).value).toBe('B 校')
  })

  it('A 校儲存中切到 B 校時，A 回覆不會覆蓋 B，B 儲存只送 B payload', async () => {
    const w = mountTab()
    await flushPromises()
    await w.find('[data-testid="email-form-from-name"]').setValue('A 校未儲存')

    const aSave = deferred<{
      data: { tenant_id: number; is_enabled: boolean; from_name: string; from_address: string }
    }>()
    h.updateTenantEmailConfig.mockReturnValueOnce(aSave.promise)
    await w.find('[data-testid="email-save"]').trigger('click')

    h.getTenantEmailConfig.mockResolvedValueOnce({
      data: { tenant_id: 3, is_enabled: false, from_name: 'B 校', from_address: 'b@example.tw' },
    })
    await w.setProps({ tenantId: 3 })
    await flushPromises()

    aSave.resolve({
      data: { tenant_id: 2, is_enabled: true, from_name: 'A 校已儲存', from_address: 'a@example.tw' },
    })
    await flushPromises()
    expect((w.find('[data-testid="email-form-from-name"]').element as HTMLInputElement).value).toBe('B 校')

    h.updateTenantEmailConfig.mockResolvedValueOnce({ data: { tenant_id: 3, is_enabled: false } })
    await w.find('[data-testid="email-form-from-name"]').setValue('B 校更新')
    await w.find('[data-testid="email-save"]').trigger('click')
    await flushPromises()
    expect(h.updateTenantEmailConfig).toHaveBeenLastCalledWith(3, {
      is_enabled: false,
      from_name: 'B 校更新',
      from_address: 'b@example.tw',
    })
  })

  it('A 校儲存回覆晚於分頁卸載時不顯示成功訊息', async () => {
    const w = mountTab()
    await flushPromises()
    await w.find('[data-testid="email-form-from-name"]').setValue('A 校未儲存')
    const pendingSave = deferred<{
      data: { tenant_id: number; is_enabled: boolean; from_name: string; from_address: string }
    }>()
    h.updateTenantEmailConfig.mockReturnValueOnce(pendingSave.promise)
    await w.find('[data-testid="email-save"]').trigger('click')

    w.unmount()
    pendingSave.resolve({
      data: { tenant_id: 2, is_enabled: true, from_name: 'A 校已儲存', from_address: 'a@example.tw' },
    })
    await flushPromises()
    expect(h.messageSuccess).not.toHaveBeenCalled()
  })
})
