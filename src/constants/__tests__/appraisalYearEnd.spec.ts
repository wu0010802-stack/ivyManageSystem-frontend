import { describe, it, expect } from 'vitest'
import {
  CYCLE_STATUS_LABEL, CYCLE_STATUS_TAG, SIGN_STATUS_LABEL, SIGN_STATUS_TAG,
  SIGN_STATUS_ORDER, GRADE_LABEL, EXCEPTION_TYPE_LABEL,
  cycleStatusLabel, signStatusLabel, gradeLabel, exceptionTypeLabel,
  statusLabel, STAGE_LABEL,
} from '@/constants/appraisalYearEnd'

describe('appraisalYearEnd 標籤單一來源', () => {
  it('週期狀態三態齊備且文案統一', () => {
    expect(CYCLE_STATUS_LABEL).toEqual({ OPEN: '開放', LOCKED: '已鎖定', CLOSED: '已封存' })
    expect(CYCLE_STATUS_TAG.OPEN).toBe('success')
  })
  it('簽核狀態四態與順序', () => {
    expect(SIGN_STATUS_ORDER).toEqual(['DRAFT', 'SUPERVISOR_SIGNED', 'ACCOUNTING_SIGNED', 'FINALIZED'])
    expect(SIGN_STATUS_LABEL.FINALIZED).toBe('已核定')
    expect(SIGN_STATUS_TAG).toEqual({ DRAFT: 'info', SUPERVISOR_SIGNED: 'warning', ACCOUNTING_SIGNED: 'primary', FINALIZED: 'success' })
  })
  it('等第沿用既有 UI 詞彙', () => {
    expect(GRADE_LABEL).toEqual({ OUTSTANDING: '優等', GOOD: '甲等', PASS: '乙等', WARN: '丙等', FAIL: '丁等' })
  })
  it('例外類型涵蓋後端全部 type code', () => {
    // 對齊 ivy-backend services/appraisal/exceptions.py 與 services/year_end/exceptions.py 的 type=
    const codes = [
      'hire_in_window_missing_employment_period', 'manual_items_missing', 'summaries_not_finalized',
      'qualification', 'missing_class_target', 'missing_head_teacher',
      'unassigned_course', 'unmatched_registrations', 'prereq_not_finalized', 'performance_anomaly',
    ]
    for (const c of codes) expect(EXCEPTION_TYPE_LABEL[c], c).toBeTruthy()
  })
  it('未知 code fallback 回 raw', () => {
    expect(cycleStatusLabel('X')).toBe('X')
    expect(signStatusLabel('X')).toBe('X')
    expect(gradeLabel('X')).toBe('X')
    expect(exceptionTypeLabel('X')).toBe('X')
  })
  it('舊 labels.ts API 原樣保留（statusLabel 即 signStatusLabel）', () => {
    expect(statusLabel('DRAFT')).toBe('草稿')
    expect(STAGE_LABEL.FINALIZE).toBe('核定')
  })
})
