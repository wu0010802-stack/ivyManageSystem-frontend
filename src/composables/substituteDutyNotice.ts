import { ElMessage } from 'element-plus'
import { extractSubstituteDutyWarnings } from '@/utils/substituteDuty'

/**
 * 把後端回應裡的 `substitute_duty_warnings`（SPEC-026 代理接手職務）逐筆以警示 toast 顯示。
 *
 * 核准、批次核准（useApprovalOperation／useApprovalModule）與管理端「編輯請假」儲存共用這一份，
 * 顯示方式（8 秒、可關閉）與文案格式不漂移。欄位不存在（加班、補卡等單據）或格式不對時什麼都不顯示。
 * 必須在成功訊息之後呼叫，警示才不會被成功訊息蓋過。
 */
export function notifySubstituteDutyWarnings(res: unknown): void {
  for (const text of extractSubstituteDutyWarnings(res)) {
    ElMessage.warning({ message: text, duration: 8000, showClose: true })
  }
}
