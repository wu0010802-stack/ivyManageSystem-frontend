/**
 * useResetPunchPin
 * 封裝「重置員工打卡 PIN」的確認 → API 呼叫 → 成功/失敗訊息流程。
 * 分離自 EmployeeView，方便單元測試。
 */
import { ElMessage, ElMessageBox } from 'element-plus'
import { resetPunchPin } from '@/api/employees'

interface EmployeeRow {
  id: number
  name: string
}

export function useResetPunchPin() {
  async function resetEmployeePin(row: EmployeeRow): Promise<void> {
    try {
      await ElMessageBox.confirm(
        `確定要重置「${row.name}」的打卡 PIN 嗎？重置後員工須至教師入口重新設定。`,
        '重置打卡 PIN',
        { type: 'warning' },
      )
    } catch {
      // 使用者按取消或關閉對話框，不執行重置
      return
    }
    try {
      await resetPunchPin(row.id)
      ElMessage.success('打卡 PIN 已重置')
    } catch {
      ElMessage.error('重置失敗，請重試')
    }
  }

  return { resetEmployeePin }
}
