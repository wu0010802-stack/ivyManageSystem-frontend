/**
 * 批次處理後的「復原」提示。
 *
 * 管理員批次接受扣款或豁免是會動到薪資的事，做錯了不該只能一筆一筆改回來：處理成功後
 * 跳一則停留 10 秒的訊息，裡面有「復原」按鈕，按下去用 action=clear 把這批清回未處理
 * （後端只清管理員代確認的列，員工自己的處理、未處理列靜默跳過）。
 *
 * 訊息一關（時間到、手動關、按完復原）就不再能送：按鈕就算還在 DOM 也不動作。
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
  /** 這次批次真的改變的出勤紀錄 id（復原只會清這些） */
  attendanceIds: number[]
  /** 復原成功之後（呼叫端重抓資料） */
  onUndone: () => void
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

  async function undo(): Promise<void> {
    if (closed || sent) return
    sent = true
    undoing.value = true
    try {
      await batchConfirmAnomalies({ attendance_ids: opts.attendanceIds, action: 'clear' })
      ElMessage.success('已復原')
      opts.onUndone()
    } catch (err) {
      notify(err, 'useConfirmUndo.undo', null, { prefix: '復原失敗' })
    } finally {
      // 不論成敗都收起：成功就沒東西可復原，失敗已經用錯誤訊息講清楚了，留一顆停用的按鈕沒有意義
      toast?.close()
    }
  }

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
    onClose: () => {
      closed = true
    },
  })
}
