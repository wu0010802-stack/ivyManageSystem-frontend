/**
 * confirmWithReason — 共用「危險操作確認＋填寫原因」helper（Task B4）。
 *
 * 收斂原本散落在各面板（BonusRatesPanel / YearlyEnrollmentTargetSection /
 * YearEndRulesPanel）的 `ElMessageBox.prompt` 樣板：統一走 textarea + 最小字數
 * `inputValidator`，並在提示文字附上常用原因快選清單。
 *
 * ⚠ `ElMessageBox.prompt` 無法內嵌可點擊按鈕（純字串 message），故「快選模板」
 * 目前只做「提示文字」版（把常用原因列在 message 內供使用者參考/複製），並非
 * 真正一鍵帶入輸入框。若要做到真一鍵，需改用自製小 dialog 元件取代
 * ElMessageBox.prompt——本 task 明確列為選配，記為延後 follow-up，不在此實作。
 *
 * 回傳值：使用者確認送出時回傳原因字串（已 trim）；使用者取消（含按 Esc/點遮罩）
 * 回傳 null，呼叫端應以 `if (reason == null) return` 短路，不繼續往下執行危險操作。
 */
import { ElMessageBox } from 'element-plus'

/** 常用原因快選模板：供 UI 提示，亦可作為其他呼叫端下拉選項的預設清單。 */
export const RULE_CHANGE_REASON_TEMPLATES: string[] = [
  '年度政策調整',
  '主管裁示',
  '校正錯誤設定',
  '配合法規更新',
]

export interface ConfirmWithReasonOptions {
  /** ElMessageBox 標題 */
  title: string
  /** 說明文字（會附加「常用原因：…」提示於後） */
  message: string
  /** 原因最小字數，預設 10（比照既有年終規則變更慣例） */
  minLength?: number
  /** 快選模板清單，預設 RULE_CHANGE_REASON_TEMPLATES */
  templates?: string[]
}

/**
 * 彈出「確認＋填寫原因」對話框。
 * @returns 使用者輸入的原因（已 trim）；使用者取消則回傳 null。
 */
export async function confirmWithReason(
  opts: ConfirmWithReasonOptions,
): Promise<string | null> {
  const min = opts.minLength ?? 10
  const tpl = opts.templates ?? RULE_CHANGE_REASON_TEMPLATES
  try {
    const result = await ElMessageBox.prompt(
      `${opts.message}\n\n常用原因：${tpl.join('、')}`,
      opts.title,
      {
        inputType: 'textarea',
        inputValidator: (v: string) =>
          (!!v && v.trim().length >= min) || `原因至少 ${min} 字`,
        confirmButtonText: '確認',
        cancelButtonText: '取消',
      },
    )
    return (result as { value: string }).value.trim()
  } catch {
    return null // 使用者取消（含按 Esc / 點遮罩）
  }
}
