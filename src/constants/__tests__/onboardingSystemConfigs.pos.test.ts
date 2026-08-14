/**
 * P3-17：POS 現金門檻兩個 system_configs key 要能在「租戶基本設定」tab 直接維護。
 *
 * key 字面須與後端手動同步（本檔非跨 repo 契約），因此測試把字面釘死；
 * 同時釘住「不得混入 onboarding 必填清單」——那會讓每個新租戶的 onboarding
 * 進度永遠不齊。
 */
import { describe, it, expect } from 'vitest'

import {
  SYSTEM_CONFIG_SECTIONS,
  ALL_SYSTEM_CONFIG_FIELDS,
} from '../onboardingSystemConfigs'

const posSection = () => SYSTEM_CONFIG_SECTIONS.find((s) => s.title === 'POS 現金門檻')

describe('POS 現金門檻 section', () => {
  it('存在且含兩個 text 欄位', () => {
    const section = posSection()
    expect(section).toBeTruthy()
    expect(section!.fields.map((f) => f.key)).toEqual([
      'pos.cash_count_required_threshold',
      'pos.cash_deposit_warning_threshold',
    ])
    expect(section!.fields.every((f) => f.type === 'text')).toBe(true)
  })

  it('標籤與預設值說明寫清楚（操作人員看得懂留空的後果）', () => {
    const [threshold, deposit] = posSection()!.fields
    expect(threshold.label).toBe('日結強制盤點門檻')
    expect(threshold.hint).toContain('3000')
    expect(deposit.label).toBe('抽屜現金存銀行提醒門檻')
    expect(deposit.hint).toContain('30000')
  })

  it('兩個 key 都被收進 ALL_SYSTEM_CONFIG_FIELDS（tab 才會實際抓值）', () => {
    const keys = ALL_SYSTEM_CONFIG_FIELDS.map((f) => f.key)
    expect(keys).toContain('pos.cash_count_required_threshold')
    expect(keys).toContain('pos.cash_deposit_warning_threshold')
  })

  it('不得標成 IP 清單欄位（不會誤觸 JSON 陣列警示）', () => {
    expect(posSection()!.fields.some((f) => f.warnJsonArray)).toBe(false)
  })
})
