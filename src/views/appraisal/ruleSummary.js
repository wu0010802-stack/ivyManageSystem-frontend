/**
 * ruleSummary — 將 scoring_rules 的 rule_type + rule_config 轉成人話多行摘要。
 *
 * 用於 AggregatedStatusDetailDialog tooltip。回傳 string[] 由呼叫端逐行渲染。
 */

const INPUT_FIELD_LABEL = {
  retention_rate: '留校率',
  activity_rate: '才藝報名率',
  late_early_count: '遲到早退次數',
  missing_punch_count: '未打卡次數',
  leave_days: '請假天數',
}

function fmtSignedNumber(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  return n > 0 ? `+${n}` : String(n)
}

export function summarizeRule(rule) {
  if (!rule) return []
  const cfg = rule.rule_config || {}
  const lines = []
  switch (rule.rule_type) {
    case 'PER_UNIT': {
      lines.push(`每次 ${fmtSignedNumber(cfg.per_unit_delta)} 分`)
      if (cfg.unit_cap != null) lines.push(`本期最多計 ${cfg.unit_cap} 次`)
      if (cfg.delta_cap != null) {
        lines.push(`累計上下限：${fmtSignedNumber(cfg.delta_cap)} 分`)
      }
      if (cfg.per_role_override) lines.push('各角色另有覆寫')
      break
    }
    case 'TIER': {
      const field = INPUT_FIELD_LABEL[cfg.input_field] || cfg.input_field || '輸入值'
      lines.push(`依${field}分級：`)
      const tiers = Array.isArray(cfg.tiers) ? [...cfg.tiers] : []
      tiers.sort((a, b) => Number(b.min) - Number(a.min))
      for (const t of tiers) {
        lines.push(`  ≥ ${t.min} → ${fmtSignedNumber(t.delta)} 分`)
      }
      break
    }
    case 'FLAT_THRESHOLD': {
      const field = INPUT_FIELD_LABEL[cfg.input_field] || cfg.input_field || '輸入值'
      lines.push(`依${field}：`)
      lines.push(`  ≥ ${cfg.threshold} → ${fmtSignedNumber(cfg.above_delta)} 分`)
      lines.push(`  < ${cfg.threshold} → ${fmtSignedNumber(cfg.below_delta)} 分`)
      break
    }
    case 'DISCIPLINARY_TIERED': {
      lines.push(`警告：${fmtSignedNumber(cfg.warning_delta)} 分`)
      lines.push(`小過：${fmtSignedNumber(cfg.minor_delta)} 分`)
      lines.push(`大過：${fmtSignedNumber(cfg.major_delta)} 分`)
      break
    }
    default:
      lines.push(`規則類型：${rule.rule_type || '未知'}`)
  }
  return lines
}
