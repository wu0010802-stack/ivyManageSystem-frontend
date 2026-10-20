import { describe, it, expect } from 'vitest'
import { previewRowNote, protectedOverwritesText, rowErrorsText, unmatchedNamesText } from '@/utils/attendanceImport'

describe('匯入預覽判讀（QA #1 #4 #14 前端）', () => {
  it('problem_reason：同名員工、不在任職期間', () => {
    expect(previewRowNote({ check: 'employee_not_found', problem_reason: 'ambiguous_name' })).toBe('同名員工，請填寫工號')
    expect(previewRowNote({ check: 'employee_not_found', problem_reason: 'not_employed' })).toBe('打卡日不在任職期間')
  })

  it('fill_empty：保留既有來源紀錄，只補空白側', () => {
    expect(previewRowNote({ check: 'overwrite', overwrite_mode: 'fill_empty', existing_source: 'correction' })).toBe('保留既有補卡紀錄，只補空白側')
    expect(previewRowNote({ check: 'overwrite', overwrite_mode: 'fill_empty', existing_source: 'manual' })).toBe('保留既有手動紀錄，只補空白側')
    expect(previewRowNote({ check: 'overwrite', overwrite_mode: 'fill_empty', existing_source: 'kiosk' })).toBe('保留既有打卡機紀錄，只補空白側')
    expect(previewRowNote({ check: 'overwrite', overwrite_mode: 'fill_empty', existing_source: 'other' })).toBe('保留既有紀錄，只補空白側')
  })

  it('一般列不加註記', () => {
    expect(previewRowNote({ check: 'overwrite', overwrite_mode: 'replace', existing_source: 'import' })).toBeNull()
    expect(previewRowNote({ check: 'importable' })).toBeNull()
  })

  it('摘要：protected_overwrites > 0 才提示', () => {
    expect(protectedOverwritesText(0)).toBe('')
    expect(protectedOverwritesText(undefined)).toBe('')
    expect(protectedOverwritesText(3)).toContain('3 筆')
  })

  it('legacy 直接匯入：列出未對到的姓名', () => {
    expect(unmatchedNamesText({ message: 'ok' })).toBe('')
    expect(unmatchedNamesText({ unmatched_names: [] })).toBe('')
    expect(unmatchedNamesText({ unmatched_names: ['王小明', '李小花'] })).toBe('2 位姓名未對到員工、未匯入：王小明、李小花')
  })

  it('protected_span_exceeded：與既有來源紀錄合併後工時不合理，未補入', () => {
    expect(previewRowNote({ check: 'review_required', problem_reason: 'protected_span_exceeded', existing_source: 'correction' })).toBe('與既有補卡紀錄合併後工時不合理，未補入')
    expect(previewRowNote({ check: 'review_required', problem_reason: 'protected_span_exceeded', existing_source: 'kiosk' })).toBe('與既有打卡機紀錄合併後工時不合理，未補入')
    expect(previewRowNote({ check: 'review_required', problem_reason: 'protected_span_exceeded' })).toBe('與既有紀錄合併後工時不合理，未補入')
  })

  it('legacy row_errors：列出前 10 筆，其餘寫「另 N 筆」', () => {
    expect(rowErrorsText({ row_errors: [] })).toBe('')
    expect(rowErrorsText({ message: 'ok' })).toBe('')
    expect(rowErrorsText({ row_errors: ['第 3 列時間格式錯誤'] })).toBe('1 列未匯入：第 3 列時間格式錯誤')
    const many = Array.from({ length: 12 }, (_, i) => `第 ${i + 1} 列錯誤`)
    const text = rowErrorsText({ row_errors: many })
    expect(text).toContain('12 列未匯入')
    expect(text).toContain('第 10 列錯誤')
    expect(text).not.toContain('第 11 列錯誤')
    expect(text.endsWith('另 2 筆')).toBe(true)
  })
})
