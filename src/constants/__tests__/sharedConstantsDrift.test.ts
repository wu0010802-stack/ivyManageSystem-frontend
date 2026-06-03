import { describe, it, expect } from 'vitest'
import { MINIMUM_MONTHLY_WAGE, MINIMUM_HOURLY_WAGE } from '../laborCompliance'
import { REFUND_APPROVAL_THRESHOLD } from '../pos'
import { FULL_ATTENDANCE_BONUS } from '../activity'

// 這些常數與後端「各寫一份」（無共用 package）。本測試鎖定前端側 canonical 值——
// 改了前端常數卻沒同步更新本檔即 fail，強迫做有意識的決策（並提醒同步後端）。
//
// ⚠️ 這只鎖前端側；真正抓「前後端單側漂移」的是 CI openapi-drift job 內的
//   scripts/check-shared-constants.mjs（兩 repo 並存時讀後端值直接比對）。
//   本檔期望值與該 script、與後端 tests/test_cross_repo_shared_constants.py 三者必須一致。
describe('跨 repo 雙寫常數 — 前端側 canonical 鎖定', () => {
  it('基本工資與後端 services/salary/minimum_wage.py 一致（勞基法§21）', () => {
    expect(MINIMUM_MONTHLY_WAGE).toBe(29500)
    expect(MINIMUM_HOURLY_WAGE).toBe(196)
  })

  it('退費簽核門檻與後端 utils/activity_constants.py REFUND_APPROVAL_THRESHOLD 一致', () => {
    expect(REFUND_APPROVAL_THRESHOLD).toBe(1000)
  })

  it('才藝達標獎金與後端 utils/activity_constants.py GRADE_TARGET_BONUS 一致', () => {
    expect(FULL_ATTENDANCE_BONUS).toBe(1000)
  })
})
