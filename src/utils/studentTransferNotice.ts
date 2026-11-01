import { ElMessage } from 'element-plus'

/**
 * 學生轉班／改班成功後的回饋（TERM-F9）。
 *
 * 後端在學生屬於已發布編班計畫時回 `warning`（轉班會讓新學年自動套用整份失敗）。
 * 這種情況改用需手動關閉的警示，避免一閃而過的「成功」蓋掉必須處理的後果；
 * 沒有 warning 時維持原本的成功訊息。
 */
export function notifyTransferResult(successMessage: string, warning?: string | null): void {
  if (warning) {
    ElMessage.warning({ message: warning, duration: 0, showClose: true })
    return
  }
  ElMessage.success(successMessage)
}
