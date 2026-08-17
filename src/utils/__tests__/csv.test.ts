// 資安回歸（2026-08-17 資安稽核）：前端自組 CSV 的欄位跳脫與公式中和。
// 觸發面：考勤匯入的「問題清單」下載，欄位值（員工姓名等）來自使用者上傳的
// Excel，可含 `=`／逗號／引號。承辦人員用 Excel 開啟該 CSV 時，`=` 開頭的
// 儲存格會被當公式執行（DDE／=HYPERLINK 外洩）。
import { describe, it, expect } from 'vitest'
import { csvCell, csvRow } from '@/utils/csv'

describe('csvCell：公式中和', () => {
  it.each(['=', '+', '-', '@'])('以 %s 開頭的值前置單引號使其成為文字', (prefix) => {
    const out = csvCell(`${prefix}cmd|'/C calc'!A0`)
    expect(out.startsWith(`"'${prefix}`)).toBe(true)
  })

  it('Tab 與 CR 開頭同樣中和（Excel 也會當公式起始）', () => {
    expect(csvCell('\tSUM(A1)')).toContain("'\t")
    expect(csvCell('\rSUM(A1)')).toContain("'\r")
  })

  it('一般文字不加單引號', () => {
    expect(csvCell('王小明')).toBe('王小明')
    expect(csvCell('2026-08-17')).toBe('2026-08-17')
  })
})

describe('csvCell：欄位跳脫', () => {
  it('含逗號的值用雙引號包住，不破壞欄位結構', () => {
    expect(csvCell('王小明,測試')).toBe('"王小明,測試"')
  })

  it('含雙引號的值把引號重複並整體包起來', () => {
    expect(csvCell('他說"你好"')).toBe('"他說""你好"""')
  })

  it('含換行的值用雙引號包住', () => {
    expect(csvCell('第一行\n第二行')).toBe('"第一行\n第二行"')
  })

  it('null / undefined 轉為空字串', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })

  it('數字照常輸出', () => {
    expect(csvCell(42)).toBe('42')
  })
})

describe('csvRow', () => {
  it('把整列組成逗號分隔字串，逐欄安全化', () => {
    expect(csvRow([1, '王小明', '=1+1', 'a,b'])).toBe('1,王小明,"\'=1+1","a,b"')
  })
})
