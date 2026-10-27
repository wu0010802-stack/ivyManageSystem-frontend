/**
 * 出勤異常的就地處理：補打卡（整列覆寫）、接受扣款、豁免。
 *
 * 出勤明細（DetailColumn）與排班與出勤抽屜（PersonDayDrawer）共用，兩邊送出的端點、payload、
 * 錯誤處理與防重複送出一致。成功後呼叫 onDone（由呼叫端決定刷新哪些資料）。
 *
 * 接受扣款／豁免會動到薪資，成功後若後端回的 undoable_ids 涵蓋這次全部處理的列，跳 10 秒內可「復原」的提示
 * （showUndoToast，清回未處理）；這筆原本已有處理（例如員工自己的申訴被覆蓋）就不給復原，只用一般成功訊息說明。
 * 補打卡不經批次確認、沒有復原，照舊用一般成功提示。
 */
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { batchConfirmAnomalies, upsertRecord } from '@/api/attendance'
import { NOTHING_PROCESSED_TEXT, confirmedFollowUp, showUndoToast } from '@/composables/useConfirmUndo'
import { useErrorNotify } from '@/composables/useErrorNotify'

export type ResolveAction = 'punch' | 'admin_accept' | 'admin_waive'
export interface ResolvePayload {
  action: ResolveAction
  punch_in?: string
  punch_out?: string
  /** 豁免理由（寫進這天出勤紀錄的備註） */
  remark?: string
  /** 成功提示（例如整天只有缺卡時「已確認缺卡」、抽屜寫出處理了誰哪天）；沒給用動作的預設說法 */
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

/** 這次處理的結果（完成回呼的第二個參數） */
export interface ResolveOutcome {
  /** 實際有沒有跳出可復原的提示：呼叫端（例如抽屜自動跳下一件）據此決定要不要另外提示 */
  undoToast: boolean
}

export interface ResolveOptions {
  /** 按了復原、清回未處理之後（呼叫端重抓資料）；沒給＝同 onDone */
  onUndone?: () => void
}

export function useResolveAnomaly(
  onDone: (payload: ResolvePayload, outcome: ResolveOutcome) => void | Promise<void>,
  source: string,
  options: ResolveOptions = {},
) {
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
      const text = payload.doneText ?? DONE_TEXT[payload.action]
      let undoToast = false
      if (payload.action === 'punch') {
        await upsertRecord({
          employee_id: target.employeeId!,
          date: target.date,
          ...(payload.punch_in !== undefined ? { punch_in: payload.punch_in } : {}),
          ...(payload.punch_out !== undefined ? { punch_out: payload.punch_out } : {}),
        })
        ElMessage.success(text)
      } else {
        const res = await batchConfirmAnomalies({
          attendance_ids: [target.attendanceId!],
          action: payload.action,
          ...(payload.remark ? { remark: payload.remark } : {}),
        })
        // 能不能復原只看後端回的 undoable_ids，不用呼叫端手上的 confirmed_action 快照猜
        const followUp = confirmedFollowUp(res.data)
        if (followUp.nothingProcessed) {
          // 後端靜默跳過（紀錄已不存在或已被改動）：不能說成「已處理」；照常呼叫完成回呼讓畫面重抓
          ElMessage.warning(NOTHING_PROCESSED_TEXT)
        } else if (followUp.undoIds) {
          showUndoToast({
            text,
            attendanceIds: followUp.undoIds,
            onUndone: options.onUndone ?? (() => { void onDone(payload, { undoToast: false }) }),
          })
          undoToast = true
        } else {
          ElMessage.success(`${text}${followUp.note}`)
        }
      }
      await onDone(payload, { undoToast })
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
