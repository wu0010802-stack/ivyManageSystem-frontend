import { describe, it, expect } from 'vitest'
import {
  onboardingComplete,
  tenantKindLabel,
  tenantStatusLabel,
  tenantStatusTagType,
  validateTenantSlug,
} from '../tenantDisplay'

describe('tenantStatusLabel / tenantStatusTagType', () => {
  it('四態各有中文與顏色', () => {
    expect(tenantStatusLabel('provisioning')).toBe('建置中')
    expect(tenantStatusLabel('active')).toBe('啟用中')
    expect(tenantStatusLabel('suspended')).toBe('已停用')
    expect(tenantStatusLabel('archived')).toBe('已封存')
    expect(tenantStatusTagType('suspended')).toBe('danger')
  })

  it('未知狀態原樣顯示，不靜默吞成空白（後端加新狀態時看得出來）', () => {
    expect(tenantStatusLabel('migrating')).toBe('migrating')
    expect(tenantStatusTagType('migrating')).toBe('info')
    expect(tenantStatusLabel(null)).toBe('—')
  })
})

describe('tenantKindLabel', () => {
  it('platform / school 有中文，其餘原樣', () => {
    expect(tenantKindLabel('platform')).toBe('總部')
    expect(tenantKindLabel('school')).toBe('分校')
    expect(tenantKindLabel('')).toBe('—')
  })
})

describe('onboardingComplete', () => {
  it('三個條件都滿足才算完成', () => {
    expect(
      onboardingComplete({ missing_config_keys: [], missing_brand_keys: [], system_roles_ok: true }),
    ).toBe(true)
    expect(
      onboardingComplete({ missing_config_keys: ['a'], missing_brand_keys: [], system_roles_ok: true }),
    ).toBe(false)
    expect(
      onboardingComplete({ missing_config_keys: [], missing_brand_keys: ['brand.x'], system_roles_ok: true }),
    ).toBe(false)
    expect(
      onboardingComplete({ missing_config_keys: [], missing_brand_keys: [], system_roles_ok: false }),
    ).toBe(false)
  })

  it('欄位缺失（舊版後端）時不當成未完成，但角色旗標明確為 false 才算缺', () => {
    expect(onboardingComplete({})).toBe(true)
  })
})

describe('validateTenantSlug', () => {
  it('合法 slug 回 null', () => {
    expect(validateTenantSlug('branch2')).toBeNull()
    expect(validateTenantSlug('a-b-c')).toBeNull()
    expect(validateTenantSlug('a')).toBeNull()
  })

  it('擋大寫 / 底線 / 前後連字號 / 空白', () => {
    expect(validateTenantSlug('Branch')).not.toBeNull()
    expect(validateTenantSlug('a_b')).not.toBeNull()
    expect(validateTenantSlug('-abc')).not.toBeNull()
    expect(validateTenantSlug('abc-')).not.toBeNull()
    expect(validateTenantSlug('  ')).not.toBeNull()
  })

  it('擋超過 63 字元（DNS label 上限，CT-D-03）', () => {
    expect(validateTenantSlug('a'.repeat(63))).toBeNull()
    expect(validateTenantSlug('a'.repeat(64))).toContain('63')
  })

  it('擋保留字（hq 是總部自己）', () => {
    expect(validateTenantSlug('hq')).toContain('保留字')
    expect(validateTenantSlug('www')).toContain('保留字')
  })
})
