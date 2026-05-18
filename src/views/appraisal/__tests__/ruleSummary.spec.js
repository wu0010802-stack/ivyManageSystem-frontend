import { describe, it, expect } from 'vitest'
import { summarizeRule } from '@/views/appraisal/ruleSummary'

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
