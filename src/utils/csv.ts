// CSV 欄位安全化：前端自組 CSV 下載時，把使用者可控值安全嵌入。
//
// 兩件事必須一起做，少一件都不夠：
//  1. **公式中和**（CWE-1236）：Excel／Numbers 會把 `=` `+` `-` `@` 或 Tab/CR
//     開頭的儲存格當公式執行。攻擊者只要讓自己的姓名之類的欄位以此開頭，
//     承辦人員一開啟報表就可能觸發 DDE 或 `=HYPERLINK` 靜默外洩同表資料。
//     前置一個單引號即可讓 Excel 視為純文字。
//  2. **欄位跳脫**（RFC 4180）：含逗號／雙引號／換行的值若不包起來會破壞欄位
//     結構，讓後續欄位錯位。
//
// 後端有對等的 `utils/excel_utils.SafeWorksheet`（xlsx 用）。這支是給前端
// 自組 CSV 的路徑用。

const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r']

/** 安全化單一 CSV 欄位值。null / undefined → 空字串。 */
export function csvCell(value: unknown): string {
  const raw = String(value ?? '')
  if (raw === '') return ''

  // 1. 公式中和：前置單引號。中和後必定要包引號，否則單引號本身會被 Excel
  //    當成資料的一部分顯示出來。
  const neutralized = FORMULA_PREFIXES.some((p) => raw.startsWith(p)) ? `'${raw}` : raw

  // 2. 欄位跳脫
  const needsQuote =
    neutralized !== raw ||
    neutralized.includes(',') ||
    neutralized.includes('"') ||
    neutralized.includes('\n') ||
    neutralized.includes('\r')

  if (!needsQuote) return neutralized
  return `"${neutralized.replace(/"/g, '""')}"`
}

/** 把一列值組成 CSV 字串（逐欄安全化）。 */
export function csvRow(values: readonly unknown[]): string {
  return values.map(csvCell).join(',')
}
