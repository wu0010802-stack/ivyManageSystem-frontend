import { ElMessage } from 'element-plus'

const WARNING_DURATION_MS = 8000

/**
 * 點名存檔回應的 warnings（DAILY-F3）：當日已完成放學接送卻被記缺席的學生，
 * 後端照常寫入但不推播缺席通知，提示教師確認是否誤點。無警示時不顯示。
 */
export function showAbsenceWarnings(warnings: readonly string[] | null | undefined): void {
  if (!warnings?.length) return
  ElMessage.warning({ message: warnings.join('\n'), duration: WARNING_DURATION_MS })
}
