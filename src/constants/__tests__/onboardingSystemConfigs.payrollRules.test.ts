/**
 * 義華第二批裁定（2026-10-23）：三個薪資／請假／加班口徑 key 借用「租戶基本設定」tab 維護。
 * key 字面與列舉值須與後端 api/system_config.py（_EXTRA_WRITABLE_CONFIG_KEYS／
 * _ENUM_CONFIG_VALUES）手動同步，因此把字面釘死。
 */
import { describe, it, expect } from 'vitest'
import { SYSTEM_CONFIG_SECTIONS, ALL_SYSTEM_CONFIG_FIELDS } from '../onboardingSystemConfigs'

const section = () => SYSTEM_CONFIG_SECTIONS.find((s) => s.title === '薪資／請假／加班規則')

describe('薪資／請假／加班規則 section', () => {
  it('含三個 key，型別分別為 month／select／switch', () => {
    expect(section()!.fields.map((f) => [f.key, f.type])).toEqual([
      ['festival_target.effective_ym', 'month'],
      ['leave_quota_year_basis', 'select'],
      ['overtime.block_on_partial_leave_day', 'switch'],
    ])
  })

  it('請假年度選項與後端列舉一致（曆年／學年／到職週年）', () => {
    const basis = section()!.fields.find((f) => f.key === 'leave_quota_year_basis')!
    expect(basis.options!.map((o) => o.value)).toEqual(['calendar', 'academic', 'anniversary'])
    expect(basis.hint).toContain('病假')
  })

  it('三個 key 都收進 ALL_SYSTEM_CONFIG_FIELDS（tab 才會實際抓值）', () => {
    const keys = ALL_SYSTEM_CONFIG_FIELDS.map((f) => f.key)
    expect(keys).toEqual(expect.arrayContaining([
      'festival_target.effective_ym',
      'leave_quota_year_basis',
      'overtime.block_on_partial_leave_day',
    ]))
  })
})
