/**
 * 批次處理後的「復原」提示。
 *
 * 管理員批次接受扣款或豁免是會動到薪資的事，做錯了不該只能一筆一筆改回來：處理成功後
 * 跳一則停留 10 秒的訊息，裡面有「復原」按鈕，按下去用 action=clear 把這批清回未處理
 * （後端只清管理員代確認的列，員工自己的處理、未處理列靜默跳過）。
 *
 * 能不能復原、復原哪些，一律看後端回傳的 undoable_ids（confirmedFollowUp）：這次被改動、且處理前
 * 為未確認的列。前端不再用自己手上的快照猜，因為取鎖後重讀時那幾列可能已被員工或別的管理員改過。
 * 復原後也照 clear 回傳的 processed 實話實說（undoOutcome）。
 *
 * 訊息一關（時間到、手動關、按完復原）就不再能送：按鈕就算還在 DOM 也不動作。
 * 畫面上只留最新一則復原提示：開新的之前先關掉上一則（連續處理多件時不堆疊）；
 * 抽屜的 U 鍵走 undoLatest 復原最近一則仍有效的提示，undoAvailable 讓畫面知道現在有沒有。
 */
import { h, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { batchConfirmAnomalies } from '@/api/attendance'
import { useErrorNotify } from '@/composables/useErrorNotify'

/** 訊息停留多久（毫秒）：復原的時間窗 */
const UNDO_WINDOW_MS = 10000

export interface UndoToastOptions {
  /** 訊息文字，例如「已批次處理 3 件」 */
  text: string
  /** 後端回傳的 undoable_ids：這次真的由未確認改成已處理的出勤紀錄 id（復原只會清這些） */
  attendanceIds: number[]
  /** 復原成功之後（呼叫端重抓資料） */
  onUndone: () => void
}

/** batch-confirm 回應中提示要用的部分（BatchConfirmResultOut；undoable_ids 在 OpenAPI 是選填） */
export interface ConfirmedResult {
  processed: number
  undoable_ids?: number[]
}

export interface ConfirmedFollowUp {
  /** 可以給復原提示時，復原要送的 id（後端的 undoable_ids）；null＝不給復原，只顯示一般成功訊息 */
  undoIds: number[] | null
  /** 不給復原時接在成功訊息後面的說明（其中幾件原本已有處理）；給復原或沒有這種件時是空字串 */
  note: string
}

/**
 * 接受扣款／豁免成功後給不給復原：undoable_ids 涵蓋這次全部 processed（數量相等）才給，
 * 復原送出的就是 undoable_ids。部分已有處理（員工自己的處理被覆蓋）時整批都不給復原，
 * 因為 clear 只清得回管理員代確認的列，給了也只能復原一部分。
 */
export function confirmedFollowUp(result: ConfirmedResult): ConfirmedFollowUp {
  const undoable = result.undoable_ids ?? []
  if (result.processed > 0 && undoable.length === result.processed) return { undoIds: undoable, note: '' }
  const already = result.processed - undoable.length
  return { undoIds: null, note: already > 0 ? `。其中 ${already} 件原本已有處理，無法復原` : '' }
}

/** 復原（clear）之後的提示：processed 與送出的件數相等才寫已復原，少的那幾件是被其他人改動了 */
export function undoOutcome(processed: number, requested: number): { type: 'success' | 'warning'; text: string } {
  if (processed >= requested) return { type: 'success', text: '已復原' }
  if (processed <= 0) return { type: 'warning', text: '沒有復原任何一件，都已被其他人改動' }
  return { type: 'warning', text: `已復原 ${processed} 件，另 ${requested - processed} 件已被其他人改動` }
}

/** 目前還畫在畫面上的復原提示（只留最新一則）；沒有＝null */
interface ActiveToast {
  /** 還能復原：沒關、沒送出過 */
  usable: () => boolean
  undo: () => Promise<void>
  /** 被新提示取代：關掉並讓它的按鈕不再送 */
  dismiss: () => void
}
let active: ActiveToast | null = null
/** 現在有沒有可復原的提示：畫面據此顯示「U 復原」的快捷鍵說明 */
export const undoAvailable = ref(false)

/** 復原最近一則仍有效的提示（抽屜的 U 鍵）；沒有可復原的（沒開過、時間到、已復原、送出中）就不做事並回 false */
export function undoLatest(): boolean {
  if (!active || !active.usable()) return false
  void active.undo()
  return true
}

const BUTTON_STYLE =
  'margin-left:12px;padding:0;border:0;background:none;font:inherit;font-weight:600;' +
  'color:var(--el-color-primary);text-decoration:underline;cursor:pointer;'
const BUTTON_STYLE_DISABLED = `${BUTTON_STYLE}opacity:0.5;cursor:not-allowed;`

export function showUndoToast(opts: UndoToastOptions): void {
  const { notify } = useErrorNotify()
  /** 訊息已關：按鈕不再送 */
  let closed = false
  /** 已經按過一次：只送一次 */
  let sent = false
  /** 畫面上的停用狀態（read in render，所以按下去立刻反映） */
  const undoing = ref(false)
  let toast: { close: () => void } | undefined

  const entry: ActiveToast = {
    usable: () => !closed && !sent,
    undo: () => undo(),
    dismiss: () => {
      markClosed()
      toast?.close()
    },
  }
  /** 這則不再能復原；只在它還是「最新一則」時才清掉全域狀態（被取代的舊提示晚一步關閉，不能把新的一起清掉） */
  function markClosed(): void {
    closed = true
    if (active === entry) {
      active = null
      undoAvailable.value = false
    }
  }

  async function undo(): Promise<void> {
    if (closed || sent) return
    sent = true
    undoing.value = true
    try {
      const res = await batchConfirmAnomalies({ attendance_ids: opts.attendanceIds, action: 'clear' })
      const outcome = undoOutcome(res.data.processed, opts.attendanceIds.length)
      ElMessage[outcome.type](outcome.text)
      // 沒復原完也要重抓：那幾件已被別人改過，畫面上的狀態不是最新的
      opts.onUndone()
    } catch (err) {
      notify(err, 'useConfirmUndo.undo', null, { prefix: '復原失敗' })
    } finally {
      // 不論成敗都收起：成功就沒東西可復原，失敗已經用錯誤訊息講清楚了，留一顆停用的按鈕沒有意義
      entry.dismiss()
    }
  }

  // 畫面上只留最新一則：先關掉上一則
  active?.dismiss()
  toast = ElMessage({
    type: 'success',
    duration: UNDO_WINDOW_MS,
    showClose: true,
    // 函式型 message 會在訊息元件裡渲染，讀得到 undoing 的變化
    message: () =>
      h('span', [
        opts.text,
        h(
          'button',
          {
            type: 'button',
            style: undoing.value ? BUTTON_STYLE_DISABLED : BUTTON_STYLE,
            disabled: undoing.value,
            onClick: () => void undo(),
          },
          '復原',
        ),
      ]),
    onClose: markClosed,
  })
  active = entry
  undoAvailable.value = true
}
