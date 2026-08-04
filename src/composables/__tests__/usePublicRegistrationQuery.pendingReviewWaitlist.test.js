import { describe, expect, it, vi } from 'vitest'

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
}))

vi.mock('@/api/activityPublic', () => ({
  publicQueryByToken: vi.fn(),
  publicConfirmPromotion: vi.fn(),
  publicDeclinePromotion: vi.fn(),
}))

import { usePublicRegistrationQuery } from '@/composables/usePublicRegistrationQuery'

// 2026-08-04 業主決策：公開端一律不揭露候補順位（後端 payload 已移除
// waitlist_position / waitlist_total）。本檔原為「待審核候補仍要顯示順位」的
// 回歸測試，反轉為「任何候補狀態都不得顯示順位」的守衛。
// 測資刻意保留兩個順位欄位（模擬舊版後端或殘留資料），確保前端就算收到也不顯示。
function setupWithCourses(courses) {
  const query = usePublicRegistrationQuery({
    refreshAvailability: vi.fn(),
    startPolling: vi.fn(),
  })
  query.queryResult.value = {
    id: 1,
    name: '測試幼兒',
    birthday: '2020-05-10',
    courses,
    supplies: [],
  }
  return query
}

describe('usePublicRegistrationQuery 候補顯示不含順位', () => {
  it('pending_review_waitlist 顯示審核中文案', () => {
    // 此狀態尚未進入正式候補佇列，連候補資格都未定，文案與一般候補分流。
    const query = setupWithCourses([
      {
        name: '圍棋',
        status: 'pending_review_waitlist',
        waitlist_position: 2,
        waitlist_total: 2,
      },
    ])

    expect(query.statusBadgeFor('圍棋')).toBe('候補資格待校方審核')
  })

  it('waitlistCourses 候補摘要包含 pending_review_waitlist 課程', () => {
    const query = setupWithCourses([
      { name: '圍棋', status: 'waitlist', waitlist_position: 1, waitlist_total: 2 },
      {
        name: '美術',
        status: 'pending_review_waitlist',
        waitlist_position: 2,
        waitlist_total: 2,
      },
      { name: '足球', status: 'enrolled' },
    ])

    expect(query.waitlistCourses.value.map((c) => c.name)).toEqual(['圍棋', '美術'])
  })

  it('一般 waitlist 只顯示「候補中」，即使 payload 仍帶順位也不得顯示', () => {
    const query = setupWithCourses([
      { name: '圍棋', status: 'waitlist', waitlist_position: 3, waitlist_total: 5 },
    ])

    const badge = query.statusBadgeFor('圍棋')
    expect(badge).toBe('候補中')
    expect(badge).not.toMatch(/\d/)
  })
})
