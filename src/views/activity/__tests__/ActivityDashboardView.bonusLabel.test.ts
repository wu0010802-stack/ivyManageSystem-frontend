/**
 * 才藝儀表板「達成獎金」欄顯示回歸測試（2026-07-26 才藝模組體檢）。
 *
 * 缺陷：欄位標題是「達成獎金 +1000」，內容卻渲染成字串 '100%'：
 *
 *     const bonusLabel = grade.subtotal.bonus === FULL_ATTENDANCE_BONUS ? '100%' : ''
 *
 * 後端 `grade.subtotal.bonus` 的語意是「年級**報名達標率** >= target_pct 時給予的
 * 獎金額（GRADE_TARGET_BONUS=1000）」——跟出席率無關，也跟 100% 無關；各年級門檻
 * 為大班 100 / 中班 90 / 小班 80 / 幼幼班 70。於是一個 90% 達標的中班，班導看到的
 * 是「達成獎金 +1000 → 100%」，誤導成「全班 100% 參加」。
 *
 * 根因是常數語意漂移：前端 `FULL_ATTENDANCE_BONUS`（滿勤獎金）註釋寫「達此值代表
 * 達成 100% 出席」，與後端 `GRADE_TARGET_BONUS` 完全不同語意。跨 repo 常數測試
 * 只斷言數值 1000 相等，抓不到語意漂移。
 *
 * 修正：常數改名為 GRADE_TARGET_BONUS（對齊後端），達標時顯示獎金額 `+1000`
 * 而非 '100%'。
 */
import { describe, it, expect } from 'vitest'
import { GRADE_TARGET_BONUS } from '@/constants/activity'
import { buildBonusLabel } from '../activityDashboardTable'

describe('才藝儀表板達成獎金欄位', () => {
  it('達標時顯示獎金額而非 100%', () => {
    const label = buildBonusLabel(GRADE_TARGET_BONUS)

    expect(label).not.toBe('100%')
    expect(label).toBe(`+${GRADE_TARGET_BONUS}`)
  })

  it('未達標顯示空字串', () => {
    expect(buildBonusLabel(0)).toBe('')
  })

  it('undefined／缺欄位顯示空字串', () => {
    expect(buildBonusLabel(undefined)).toBe('')
  })

  it('非 0 的其他金額仍照實顯示（後端日後調整獎金額不需改前端）', () => {
    expect(buildBonusLabel(1500)).toBe('+1500')
  })
})

describe('常數語意與後端對齊', () => {
  it('GRADE_TARGET_BONUS 與後端 utils/activity_constants.py 同名同值', () => {
    expect(GRADE_TARGET_BONUS).toBe(1000)
  })
})
