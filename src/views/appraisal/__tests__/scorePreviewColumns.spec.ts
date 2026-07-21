import { describe, it, expect, beforeEach } from 'vitest'
import {
  SCORE_COL_LS_KEY,
  loadVisibleScoreColOverride,
  saveVisibleScoreColOverride,
  computeChangedColumns,
} from '../scorePreviewColumns'

describe('scorePreviewColumns', () => {
  beforeEach(() => localStorage.clear())

  it('未覆寫時 loadVisibleScoreColOverride 回 null', () => {
    expect(loadVisibleScoreColOverride()).toBeNull()
  })

  it('存讀往返一致 + 白名單過濾髒資料', () => {
    saveVisibleScoreColOverride(new Set(['LATE_EARLY', 'BOGUS']))
    localStorage.setItem(SCORE_COL_LS_KEY, JSON.stringify(['LATE_EARLY', 'BOGUS', 123]))
    const loaded = loadVisibleScoreColOverride()
    expect(loaded?.has('LATE_EARLY')).toBe(true)
    expect(loaded?.has('BOGUS')).toBe(false) // 非合法 item_code 濾除
  })

  it('computeChangedColumns 只回有異動的欄', () => {
    const changed = computeChangedColumns([
      { participant_id: 1, employee_name: 'A', items: [
        { item_code: 'LATE_EARLY', delta: -2, current_db_value: 0 },
        { item_code: 'RETENTION', delta: 0, current_db_value: 0 },
      ] },
    ] as never)
    expect(changed.has('LATE_EARLY')).toBe(true)
    expect(changed.has('RETENTION')).toBe(false)
  })
})
