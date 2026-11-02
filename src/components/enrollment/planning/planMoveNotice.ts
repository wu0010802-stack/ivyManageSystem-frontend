// 編班表搬班成功的通知（附「復原」鈕）。獨立成模組：工作台測試可整個 mock 掉，
// 本身的按鈕行為在 planMoveNotice.spec.ts 驗。
import { h } from 'vue'
import { ElButton, ElNotification } from 'element-plus'
import type { NotificationHandle } from 'element-plus'
// 程式呼叫的 ElNotification 不會被 unplugin 自動帶入樣式（main.ts 只全域載入
// message／message-box）；沒有這行通知會變成頁面最底下一條無樣式的區塊
import 'element-plus/theme-chalk/el-notification.css'

/** 停留時間：要讓人看完一句話、決定要不要復原（滑鼠移上去時 EP 會暫停計時）。 */
export const MOVE_NOTICE_DURATION_MS = 8000

export interface MoveNoticeHandle {
  close: () => void
}

/**
 * 顯示搬班結果。給了 `onUndo` 才有「復原」鈕（真的 `<button>`，鍵盤可聚焦操作）；
 * 按下會先關掉通知再執行復原，避免同一則通知被按兩次。
 */
export function showMoveNotice(options: { message: string; onUndo?: () => void }): MoveNoticeHandle {
  let handle: NotificationHandle | null = null
  const children = [h('span', { class: 'plan-move-notice__text' }, options.message)]
  const onUndo = options.onUndo
  if (onUndo) {
    children.push(
      h(
        ElButton,
        {
          class: 'plan-move-notice__undo',
          size: 'small',
          onClick: () => {
            handle?.close()
            onUndo()
          },
        },
        () => '復原',
      ),
    )
  }
  handle = ElNotification({
    type: 'success',
    title: '已更新分派',
    position: 'bottom-right',
    duration: MOVE_NOTICE_DURATION_MS,
    // 通知掛在 body 底下，scoped 樣式管不到，排版直接寫在節點上（只用 token）
    message: h(
      'div',
      {
        class: 'plan-move-notice',
        style: 'display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-2) var(--space-3)',
      },
      children,
    ),
  })
  return { close: () => handle?.close() }
}
