// 考勤匯入結果彙整 helper 回歸測試。
//
// 原 bug：後端 /attendance/upload-csv 與 /attendance/upload 對「逐列失敗」
// 回 HTTP 200（失敗數與錯誤明細在 body results 內），前端只看 HTTP 狀態
// 一律顯示成功 toast → 資料沒寫入卻誤報「出勤已更新／匯入完成」。
import { describe, it, expect } from 'vitest'
import { summarizeCsvImportResult } from '@/utils/attendanceImport'

describe('summarizeCsvImportResult', () => {
  it('failed=0 → ok=true，text 用後端 message', () => {
    const r = summarizeCsvImportResult({
      message: '考勤記錄匯入完成，成功 2 筆，失敗 0 筆',
      results: { success: 2, failed: 0, errors: [] },
    })
    expect(r.ok).toBe(true)
    expect(r.text).toBe('考勤記錄匯入完成，成功 2 筆，失敗 0 筆')
  })

  it('failed>0 → ok=false，text 帶 message 與錯誤明細', () => {
    const r = summarizeCsvImportResult({
      message: '考勤記錄匯入完成，成功 0 筆，失敗 1 筆',
      results: { success: 0, failed: 1, errors: ['找不到員工: 王小明 (編號: E999)'] },
    })
    expect(r.ok).toBe(false)
    expect(r.text).toContain('失敗 1 筆')
    expect(r.text).toContain('找不到員工: 王小明 (編號: E999)')
  })

  it('errors 超過 3 筆 → 只列前 3 筆並註記其餘筆數', () => {
    const r = summarizeCsvImportResult({
      message: '考勤記錄匯入完成，成功 0 筆，失敗 5 筆',
      results: { success: 0, failed: 5, errors: ['e1', 'e2', 'e3', 'e4', 'e5'] },
    })
    expect(r.ok).toBe(false)
    expect(r.text).toContain('e1')
    expect(r.text).toContain('e3')
    expect(r.text).not.toContain('e4')
    expect(r.text).toContain('其餘 2 筆')
  })

  it('failed>0 但無 errors 明細 → ok=false，text 仍為 message', () => {
    const r = summarizeCsvImportResult({
      message: '考勤記錄匯入完成，成功 1 筆，失敗 1 筆',
      results: { success: 1, failed: 1, errors: [] },
    })
    expect(r.ok).toBe(false)
    expect(r.text).toBe('考勤記錄匯入完成，成功 1 筆，失敗 1 筆')
  })

  it('無 results 欄位（xlsx 舊格式回傳）→ ok=true', () => {
    const r = summarizeCsvImportResult({ message: '考勤記錄解析並存檔完成 (已處理 3 人)' })
    expect(r.ok).toBe(true)
    expect(r.text).toBe('考勤記錄解析並存檔完成 (已處理 3 人)')
  })

  it('data 非物件（防禦）→ ok=true 用 fallback 文案', () => {
    const r = summarizeCsvImportResult(undefined)
    expect(r.ok).toBe(true)
    expect(r.text).toBe('匯入完成')
  })
})
