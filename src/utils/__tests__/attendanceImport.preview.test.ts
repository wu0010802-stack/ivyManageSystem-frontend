import { describe, it, expect } from 'vitest'
import { previewRowNote, protectedOverwritesText, unmatchedNamesText } from '@/utils/attendanceImport'

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
})
