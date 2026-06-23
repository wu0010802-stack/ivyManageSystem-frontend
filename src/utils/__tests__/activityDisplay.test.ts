import { describe, it, expect } from 'vitest'
import { buildFormCardTitle, excludeAddedSupplies, estimateCourseStatus } from '../activityDisplay'

describe('buildFormCardTitle', () => {
  it('有活動日期時，主標題（去｜副標）後接「· 日期」', () => {
    expect(buildFormCardTitle('114 下藝童趣｜課後才藝報名', '2026-02-23')).toBe(
      '114 下藝童趣 · 2026-02-23',
    )
  })

  it('無活動日期時，不留尾部「 · 」', () => {
    expect(buildFormCardTitle('課後才藝報名', '')).toBe('課後才藝報名')
  })

  it('title 為空字串時不報错，回傳空字串', () => {
    expect(buildFormCardTitle('', '')).toBe('')
  })
})

describe('excludeAddedSupplies', () => {
  it('排除已加入的用品（number / string id 皆比對）', () => {
    const supplies = [
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
      { id: 3, name: 'C' },
    ]
    expect(excludeAddedSupplies(supplies, [2, '3']).map((s) => s.id)).toEqual([1])
  })

  it('無已加入時回原清單', () => {
    const supplies = [{ id: 1, name: 'A' }]
    expect(excludeAddedSupplies(supplies, [])).toEqual(supplies)
  })
})

// ── estimateCourseStatus ────────────────────────────────────────────────────
// Bug P2：課程額滿（availability===0）+ allow_waitlist + 本生已 enrolled
// → 後端 update 排除自己，本生座位維持 enrolled；前端誤估 'waitlist' → feePreview 剔除學費
// → wouldOverpay=true → saveBlocked=true → 家長無法儲存合法的修改。
describe('estimateCourseStatus', () => {
  const enrolledCourses = [{ name: '鋼琴', status: 'enrolled' }]
  const promotedCourses = [{ name: '美術', status: 'promoted_pending' }]

  it('(a) 課程額滿（availability===0）+ 本生原狀態 enrolled → 應估為 enrolled（修前錯回 waitlist）', () => {
    // availability[name]===0 在修前會直接 return 'waitlist'；修後應先檢查本生既有座位
    expect(
      estimateCourseStatus('鋼琴', { 鋼琴: 0 }, enrolledCourses),
    ).toBe('enrolled')
  })

  it('(a2) 課程額滿 + 本生原狀態 promoted_pending → 應估為 enrolled（後端 update 亦視同佔位）', () => {
    expect(
      estimateCourseStatus('美術', { 美術: 0 }, promotedCourses),
    ).toBe('enrolled')
  })

  it('(b) 全新課程（queryResult 中無本生 enrolled/promoted_pending）+ availability===0 → 仍回 waitlist（避免過度修改）', () => {
    // 新加課程在 queryResult.courses 中不存在本生 enrolled 記錄
    expect(
      estimateCourseStatus('體能', { 體能: 0 }, enrolledCourses),
    ).toBe('waitlist')
  })

  it('有名額（availability>0）→ enrolled（不論是否已有原狀態）', () => {
    expect(
      estimateCourseStatus('鋼琴', { 鋼琴: 3 }, enrolledCourses),
    ).toBe('enrolled')
  })

  it('availability 不含該課（undefined）+ 本生已在 queryResult enrolled → 用原狀態 enrolled', () => {
    expect(
      estimateCourseStatus('鋼琴', {}, enrolledCourses),
    ).toBe('enrolled')
  })

  it('availability 不含該課（undefined）+ 本生原狀態 waitlist → 用原狀態 waitlist', () => {
    expect(
      estimateCourseStatus('鋼琴', {}, [{ name: '鋼琴', status: 'waitlist' }]),
    ).toBe('waitlist')
  })

  it('availability 不含該課（undefined）+ queryResult 中無本生記錄 → fallback enrolled', () => {
    expect(
      estimateCourseStatus('鋼琴', {}, []),
    ).toBe('enrolled')
  })

  it('availability<0（滿且不開候補）+ 本生原 enrolled → 仍 enrolled（保留座位、計費）', () => {
    // remaining < 0 表示滿且不開候補；本生既已佔位，後端 update 排除自己座位保留
    expect(
      estimateCourseStatus('鋼琴', { 鋼琴: -1 }, enrolledCourses),
    ).toBe('enrolled')
  })

  it('(c) availability<0（滿且不開候補）+ 本生原 promoted_pending → 仍 enrolled（保留座位）', () => {
    expect(
      estimateCourseStatus('美術', { 美術: -1 }, promotedCourses),
    ).toBe('enrolled')
  })

  it('(d) availability<0（滿且不開候補）+ 本生無原報名 → unavailable（不計費，前端剔除）', () => {
    // 新加課程在 queryResult.courses 中無本生 enrolled/promoted_pending 記錄
    // → 後端 fail-closed 注定 400，前端不應虛報學費
    expect(
      estimateCourseStatus('陶藝', { 陶藝: -1 }, enrolledCourses),
    ).toBe('unavailable')
  })
})
