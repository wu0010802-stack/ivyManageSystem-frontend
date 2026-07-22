import { describe, it, expect } from 'vitest'
import { summarizeRule, summarizeRuleOneLine } from '@/views/appraisal/ruleSummary'

describe('summarizeRule', () => {
  it('returns [] for null/undefined', () => {
    expect(summarizeRule(null)).toEqual([])
    expect(summarizeRule(undefined)).toEqual([])
  })

  describe('PER_UNIT', () => {
    it('formats negative per_unit_delta', () => {
      const lines = summarizeRule({
        rule_type: 'PER_UNIT',
        rule_config: { per_unit_delta: -0.25 },
      })
      expect(lines).toEqual(['每次 -0.25 分'])
    })

    it('formats positive per_unit_delta with leading +', () => {
      const lines = summarizeRule({
        rule_type: 'PER_UNIT',
        rule_config: { per_unit_delta: 0.5 },
      })
      expect(lines).toEqual(['每次 +0.5 分'])
    })

    it('includes unit_cap and delta_cap when present', () => {
      const lines = summarizeRule({
        rule_type: 'PER_UNIT',
        rule_config: { per_unit_delta: -0.25, unit_cap: 10, delta_cap: -3 },
      })
      expect(lines).toEqual([
        '每次 -0.25 分',
        '本期最多計 10 次',
        '累計上下限：-3 分',
      ])
    })

    it('flags per_role_override', () => {
      const lines = summarizeRule({
        rule_type: 'PER_UNIT',
        rule_config: { per_unit_delta: -1, per_role_override: { HEAD_TEACHER: -2 } },
      })
      expect(lines).toContain('各角色另有覆寫')
    })
  })

  describe('TIER', () => {
    it('translates known input_field and sorts tiers desc', () => {
      const lines = summarizeRule({
        rule_type: 'TIER',
        rule_config: {
          input_field: 'retention_rate',
          tiers: [
            { min: 0, delta: 0 },
            { min: 95, delta: 2 },
            { min: 80, delta: 1 },
          ],
        },
      })
      expect(lines[0]).toBe('依留校率分級：')
      expect(lines.slice(1)).toEqual([
        '  ≥ 95 → +2 分',
        '  ≥ 80 → +1 分',
        '  ≥ 0 → 0 分',
      ])
    })

    it('falls back to raw input_field when unknown', () => {
      const lines = summarizeRule({
        rule_type: 'TIER',
        rule_config: { input_field: 'custom_metric', tiers: [{ min: 0, delta: 1 }] },
      })
      expect(lines[0]).toBe('依custom_metric分級：')
    })
  })

  describe('FLAT_THRESHOLD', () => {
    it('formats threshold with above/below deltas', () => {
      const lines = summarizeRule({
        rule_type: 'FLAT_THRESHOLD',
        rule_config: {
          input_field: 'activity_rate',
          threshold: 80,
          above_delta: 1,
          below_delta: -1,
        },
      })
      expect(lines).toEqual([
        '依才藝報名率：',
        '  ≥ 80 → +1 分',
        '  < 80 → -1 分',
      ])
    })
  })

  describe('DISCIPLINARY_TIERED', () => {
    it('formats warning/minor/major deltas', () => {
      const lines = summarizeRule({
        rule_type: 'DISCIPLINARY_TIERED',
        rule_config: { warning_delta: -1, minor_delta: -3, major_delta: -5 },
      })
      expect(lines).toEqual([
        '警告：-1 分',
        '小過：-3 分',
        '大過：-5 分',
      ])
    })
  })

  it('falls back to rule_type label for unknown types', () => {
    const lines = summarizeRule({ rule_type: 'WEIRD_TYPE', rule_config: {} })
    expect(lines).toEqual(['規則類型：WEIRD_TYPE'])
  })
})

describe('summarizeRuleOneLine', () => {
  it('PER_UNIT 單行', () => {
    expect(summarizeRuleOneLine({ rule_type: 'PER_UNIT', per_unit_delta: -2 }))
      .toContain('每次')
  })

  it('TIER 單行含階數', () => {
    const s = summarizeRuleOneLine({ rule_type: 'TIER', input_field: 'retention_rate', tiers: [{ min: 0, delta: 0 }, { min: 0.8, delta: 5 }] })
    expect(s).toMatch(/階梯|階/)
  })

  it('PER_UNIT（真實 rule_config 巢狀）壓成單行含分數', () => {
    const s = summarizeRuleOneLine({
      rule_type: 'PER_UNIT',
      rule_config: { per_unit_delta: -0.5 },
    })
    expect(s).toBe('每次 -0.5 分')
  })

  it('TIER（真實 rule_config 巢狀）單行含階數與明細', () => {
    const s = summarizeRuleOneLine({
      rule_type: 'TIER',
      rule_config: {
        input_field: 'retention_rate',
        tiers: [
          { min: 0, delta: -2 },
          { min: 80, delta: 0 },
          { min: 95, delta: 2 },
        ],
      },
    })
    expect(s).toContain('3 階')
    expect(s).toContain('+2 分')
  })

  it('FLAT_THRESHOLD 壓成單行且沿用 summarizeRule 明細', () => {
    const s = summarizeRuleOneLine({
      rule_type: 'FLAT_THRESHOLD',
      rule_config: { input_field: 'activity_rate', threshold: 50, above_delta: 1, below_delta: -1 },
    })
    expect(s).not.toContain('\n')
    expect(s).toContain('50')
    expect(s).toContain('+1 分')
    expect(s).toContain('-1 分')
  })

  it('DISCIPLINARY_TIERED 壓成單行且沿用 summarizeRule 明細', () => {
    const s = summarizeRuleOneLine({
      rule_type: 'DISCIPLINARY_TIERED',
      rule_config: { warning_delta: -1, minor_delta: -3, major_delta: -9 },
    })
    expect(s).not.toContain('\n')
    expect(s).toContain('警告：-1 分')
    expect(s).toContain('小過：-3 分')
    expect(s).toContain('大過：-9 分')
  })

  it('無規則時回「尚未設定」', () => {
    expect(summarizeRuleOneLine(null)).toBe('尚未設定')
    expect(summarizeRuleOneLine(undefined)).toBe('尚未設定')
  })
})
