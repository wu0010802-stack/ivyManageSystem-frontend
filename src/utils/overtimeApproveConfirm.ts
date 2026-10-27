import { money } from '@/utils/format'

/**
 * 單筆核准加班的確認文案：講清楚是誰、哪天、幾小時，以及核准後的實際影響
 * （計薪＝加班費列入該月薪資；補休＝給補休時數）。批次核准另有 useApprovalModule 的確認。
 */
export function buildOvertimeApproveConfirm(row: Record<string, unknown>): string {
  const who = [row.employee_name, row.overtime_date].filter(Boolean).join(' ')
  // 後端標籤是「平日／假日／國定假日」；已帶「加班」字尾的不重複補
  const label = String(row.overtime_type_label ?? '').replace(/加班$/, '')
  const kind = `${label}加班`
  const effect = row.use_comp_leave
    ? `核准後會給 ${row.hours}h 補休。`
    : row.overtime_pay != null
      ? `核准後加班費 ${money(row.overtime_pay as number)} 會列入該月薪資。`
      : '核准後加班費會列入該月薪資。'
  return `核准 ${who} 的${kind} ${row.hours}h？${effect}`
}
