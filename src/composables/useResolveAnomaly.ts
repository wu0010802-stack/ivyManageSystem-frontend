/**
 * 出勤異常的就地處理：補打卡（整列覆寫）、接受扣款、豁免。
 *
 * 出勤明細（DetailColumn）與排班與出勤抽屜（PersonDayDrawer）共用，兩邊送出的端點、payload、
 * 錯誤處理與防重複送出一致。成功後呼叫 onDone（由呼叫端決定刷新哪些資料）。
 */
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { batchConfirmAnomalies, upsertRecord } from '@/api/attendance'
import { useErrorNotify } from '@/composables/useErrorNotify'

export type ResolveAction = 'punch' | 'admin_accept' | 'admin_waive'
export interface ResolvePayload {
  action: ResolveAction
  punch_in?: string
  punch_out?: string
  /** 成功提示（例如整天只有缺卡時「已確認缺卡」）；沒給用動作的預設說法 */
  doneText?: string
}

/** 成功提示寫出做了什麼（只寫「已處理」看不出是扣了還是豁免了） */
const DONE_TEXT: Record<ResolveAction, string> = {
  punch: '已補打卡並重新計算',
  admin_accept: '已接受扣款',
  admin_waive: '已豁免',
}
export interface ResolveTarget {
  /** 員工主鍵（補打卡用） */
  employeeId: number | null
  date: string
  /** 出勤紀錄 id（接受扣款／豁免用；沒有出勤紀錄列時為 null） */
  attendanceId: number | null
}

export function useResolveAnomaly(onDone: () => void | Promise<void>, source: string) {
  const resolving = ref(false)
  const { notify } = useErrorNotify()

  async function resolve(target: ResolveTarget, payload: ResolvePayload): Promise<boolean> {
    if (resolving.value) return false
    if (payload.action === 'punch' && target.employeeId == null) {
      ElMessage.warning('找不到對應員工，無法補打卡')
      return false
    }
    if (payload.action !== 'punch' && target.attendanceId == null) {
      ElMessage.warning('這天沒有出勤紀錄，無法接受扣款或豁免')
      return false
    }
    resolving.value = true
    try {
      if (payload.action === 'punch') {
        await upsertRecord({
          employee_id: target.employeeId!,
          date: target.date,
          ...(payload.punch_in !== undefined ? { punch_in: payload.punch_in } : {}),
          ...(payload.punch_out !== undefined ? { punch_out: payload.punch_out } : {}),
        })
      } else {
        await batchConfirmAnomalies({ attendance_ids: [target.attendanceId!], action: payload.action })
      }
      ElMessage.success(payload.doneText ?? DONE_TEXT[payload.action])
      await onDone()
      return true
    } catch (err) {
      notify(err, source, null, { prefix: '處理失敗' })
      return false
    } finally {
      resolving.value = false
    }
  }

  return { resolving, resolve }
}
