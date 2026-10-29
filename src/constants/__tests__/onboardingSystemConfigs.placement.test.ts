/**
 * 後台 IA 重整 S5（2026-10-29）：system_configs 欄位歸位到各模組設定頁。
 *
 * 守三件事：① 每個 key 恰好屬於一個 placement（不會同時出現在兩處讓人改兩份）；
 * ② 位置對照固定（改位置要同步改 SettingsMovedConfigNotice 的指路）；
 * ③ 金流簽核 key 清單與後端 FINANCE_CONTROLLED_CONFIG_KEYS 在前端有顯示的部分對齊。
 */
import { describe, it, expect } from 'vitest'
import {
  SYSTEM_CONFIG_SECTIONS,
  ALL_SYSTEM_CONFIG_FIELDS,
  FINANCE_APPROVE_CONFIG_KEYS,
  SUPER_ADMIN_ONLY_CONFIG_KEYS,
  sectionsForPlacement,
  type SystemConfigPlacement,
} from '../onboardingSystemConfigs'

const keysAt = (placement: SystemConfigPlacement) =>
  sectionsForPlacement(placement).flatMap((s) => s.fields.map((f) => f.key))

describe('system_configs 欄位歸位（S5）', () => {
  it('位置對照固定', () => {
    expect(keysAt('settings')).toEqual(['org_name', 'consent.enforcement_enabled'])
    expect(keysAt('attendance')).toEqual(['kiosk.allowed_ips', 'auth.school_wifi_ips'])
    expect(keysAt('gov')).toEqual([
      'gov.labor_insurance_unit_code',
      'gov.health_insurance_unit_code',
      'gov.pension_employer_code',
    ])
    expect(keysAt('activity')).toEqual([
      'pos.cash_count_required_threshold',
      'pos.cash_deposit_warning_threshold',
    ])
    expect(keysAt('salary')).toEqual([
      'festival_target.effective_ym',
      'leave_quota_year_basis',
      'overtime.block_on_partial_leave_day',
      'year_end.exclude_maternity_months',
      'festival.unsigned_cutoff_hire_date',
      'leave.ot_offset_enabled',
    ])
  })

  it('每個 key 恰好屬於一個位置；校車座標已移走（/bus/settings 自有編輯）', () => {
    const keys = ALL_SYSTEM_CONFIG_FIELDS.map((f) => f.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toHaveLength(15)
    expect(keys.some((k) => k.startsWith('bus.'))).toBe(false)
    const placed = (['settings', 'attendance', 'gov', 'activity', 'salary'] as const).flatMap(keysAt)
    expect([...placed].sort()).toEqual([...keys].sort())
  })

  it('每個區塊都帶 placement', () => {
    expect(SYSTEM_CONFIG_SECTIONS.every((s) => !!s.placement)).toBe(true)
  })

  it('金流簽核 key 都是本檔有顯示的 key；與超級管理員 key 不重疊（兩種門檻各管各的）', () => {
    const keys = new Set(ALL_SYSTEM_CONFIG_FIELDS.map((f) => f.key))
    for (const k of FINANCE_APPROVE_CONFIG_KEYS) expect(keys.has(k), k).toBe(true)
    for (const k of FINANCE_APPROVE_CONFIG_KEYS) expect(SUPER_ADMIN_ONLY_CONFIG_KEYS.has(k), k).toBe(false)
  })

  it('金流簽核 key 清單字面（對齊後端 FINANCE_CONTROLLED_CONFIG_KEYS 中本檔有顯示的部分）', () => {
    expect([...FINANCE_APPROVE_CONFIG_KEYS].sort()).toEqual([
      'festival.unsigned_cutoff_hire_date',
      'festival_target.effective_ym',
      'leave_quota_year_basis',
      'pos.cash_count_required_threshold',
      'pos.cash_deposit_warning_threshold',
      'year_end.exclude_maternity_months',
    ])
    // overtime.block_on_partial_leave_day 後端只要 SETTINGS_WRITE（不在金流簽核清單）
    expect(FINANCE_APPROVE_CONFIG_KEYS.has('overtime.block_on_partial_leave_day')).toBe(false)
  })
})
