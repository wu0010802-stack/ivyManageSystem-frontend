import { describe, it, expect } from 'vitest'
import { SCOPE_AWARE_CODES } from '@/utils/auth'

// RA-HIGH-1c parity 守同步：前端 SCOPE_AWARE_CODES 必須與後端
// utils/permissions.py 的 scope-aware 集合一致，否則會出現
// 「前端顯示有權、後端 403」（或反向）的單側漂移。
//
// 策略（hardcoded + 手動同步）：對齊本 repo 既有 PII denylist /
// errorCodeRegistry 的跨端對齊慣例（皆 hardcoded + 註明同步來源，
// 不在 test 時讀 sibling repo），原因：
//   1. CI 不保證有 sibling ivy-backend checkout（本 repo 所有
//      readFileSync 測試皆 process.cwd() 內，從不跨 repo）。
//   2. 截至 2026-06-02 後端 permissions.py 尚未匯出
//      `SCOPE_AWARE_CODES` 常數（Task 2 待落地），無法可靠 regex 抽取。
//
// 期望集合在此「重新逐筆寫出」（不從 @/utils/auth import），
// 這樣才能真正抓到 auth.ts 的漂移，而非把常數拿來跟自己比。
//
// ⚠️ 新增 / 移除後端 scope-aware 權限時，必須同步修改：
//   - 後端 utils/permissions.py（scope_options seed / scope-aware 集合）
//   - 前端 src/utils/auth.ts 的 SCOPE_AWARE_CODES
//   - 本檔 EXPECTED_SCOPE_AWARE_CODES
const EXPECTED_SCOPE_AWARE_CODES = new Set([
  'STUDENTS_READ',
  'STUDENTS_WRITE',
  'STUDENTS_HEALTH_READ',
  'STUDENTS_HEALTH_WRITE',
  'STUDENTS_LIFECYCLE_WRITE',
  'STUDENTS_MEDICATION_ADMINISTER',
  'STUDENTS_SPECIAL_NEEDS_READ',
  'STUDENTS_SPECIAL_NEEDS_WRITE',
  'PORTFOLIO_READ',
  'PORTFOLIO_WRITE',
  'PORTFOLIO_PUBLISH',
  'DISMISSAL_CALLS_READ',
  'DISMISSAL_CALLS_WRITE',
  'CLASS_ALBUMS_READ',
  'CLASS_ALBUMS_WRITE',
])

describe('scope-aware code parity 前後端同步 (RA-HIGH-1c)', () => {
  it('前端 SCOPE_AWARE_CODES 與期望（後端對齊）集合完全一致', () => {
    expect(new Set(SCOPE_AWARE_CODES)).toEqual(EXPECTED_SCOPE_AWARE_CODES)
  })

  it('剛好 15 筆（漂移 canary）', () => {
    expect(SCOPE_AWARE_CODES.size).toBe(15)
  })
})
