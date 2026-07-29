import { describe, expect, it, vi } from 'vitest'

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
}))

vi.mock('@/api/activityPublic', () => ({
  publicQueryRegistration: vi.fn(),
  publicQueryByToken: vi.fn(),
  publicConfirmPromotion: vi.fn(),
  publicDeclinePromotion: vi.fn(),
}))

import { usePublicRegistrationQuery } from '@/composables/usePublicRegistrationQuery'

// 後端 _build_public_query_payload 對 QUEUE_STATUSES（waitlist +
// pending_review_waitlist）都會回 waitlist_position / waitlist_total；
// 家長端顯示不得因識別狀態不同而丟掉順位資訊（2026-07-27 回歸）。
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

describe('usePublicRegistrationQuery 待審核候補順位顯示', () => {
  it('pending_review_waitlist 顯示審核中文案，不把殘留 waitlist_position 冒充候補順位', () => {
    // 2026-07-28 收尾包口徑：pending_review_waitlist 尚未進入正式候補佇列，
    // 後端不保證順位；舊資料殘留 waitlist_position 也不可顯示成一般候補名次。
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

  it('一般 waitlist 徽章行為不變', () => {
    const query = setupWithCourses([
      { name: '圍棋', status: 'waitlist', waitlist_position: 3, waitlist_total: 5 },
    ])

    expect(query.statusBadgeFor('圍棋')).toBe('候補第 3 位')
  })
})
