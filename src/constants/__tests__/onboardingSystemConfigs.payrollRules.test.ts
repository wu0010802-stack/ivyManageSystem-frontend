/**
 * 義華第二批裁定（2026-10-23）：五個薪資／請假／加班／年終／節慶口徑 key 借用「租戶基本設定」tab 維護。
 * key 字面與列舉值須與後端 api/system_config.py（_EXTRA_WRITABLE_CONFIG_KEYS／
 * _ENUM_CONFIG_VALUES）手動同步，因此把字面釘死。
 */
import { describe, it, expect } from 'vitest'
import { SYSTEM_CONFIG_SECTIONS, ALL_SYSTEM_CONFIG_FIELDS } from '../onboardingSystemConfigs'

const section = () => SYSTEM_CONFIG_SECTIONS.find((s) => s.title === '薪資／請假／加班規則')

describe('薪資／請假／加班規則 section', () => {
  it('含五個 key，型別分別為 month／select／switch／switch／date', () => {
    expect(section()!.fields.map((f) => [f.key, f.type])).toEqual([
      ['festival_target.effective_ym', 'month'],
      ['leave_quota_year_basis', 'select'],
      ['overtime.block_on_partial_leave_day', 'switch'],
      ['year_end.exclude_maternity_months', 'switch'],
      ['festival.unsigned_cutoff_hire_date', 'date'],
    ])
  })

  it('產假月份開關的說明揭露 15 日門檻、性平法風險與須重建年終', () => {
    const f = section()!.fields.find((x) => x.key === 'year_end.exclude_maternity_months')!
    expect(f.label).toBe('產假月份不計入年終到職月數')
    expect(f.hint).toContain('15 日')
    expect(f.hint).toContain('性別平等工作法 §21')
    expect(f.hint).toContain('重建年終結算')
  })

  it('未簽約新人截止日的說明提醒先補簽約日', () => {
    const f = section()!.fields.find((x) => x.key === 'festival.unsigned_cutoff_hire_date')!
    expect(f.label).toBe('未簽約新人節慶截止日')
    expect(f.hint).toContain('自主成長簽約日')
    expect(f.hint).toContain('補上簽約日')
  })

  it('請假年度選項與後端列舉一致（曆年／學年／到職週年）', () => {
    const basis = section()!.fields.find((f) => f.key === 'leave_quota_year_basis')!
    expect(basis.options!.map((o) => o.value)).toEqual(['calendar', 'academic', 'anniversary'])
    expect(basis.hint).toContain('病假')
  })

  it('五個 key 都收進 ALL_SYSTEM_CONFIG_FIELDS（tab 才會實際抓值）', () => {
    const keys = ALL_SYSTEM_CONFIG_FIELDS.map((f) => f.key)
    expect(keys).toEqual(expect.arrayContaining([
      'festival_target.effective_ym',
      'leave_quota_year_basis',
      'overtime.block_on_partial_leave_day',
      'year_end.exclude_maternity_months',
      'festival.unsigned_cutoff_hire_date',
    ]))
  })
})
