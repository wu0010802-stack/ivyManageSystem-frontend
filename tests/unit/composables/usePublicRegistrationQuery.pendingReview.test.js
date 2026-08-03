import { describe, expect, it, vi } from 'vitest'

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
}))

vi.mock('@/api/activityPublic', () => ({
  publicQueryByToken: vi.fn(),
}))

import { usePublicRegistrationQuery } from '@/composables/usePublicRegistrationQuery'

describe('usePublicRegistrationQuery pending_review_waitlist', () => {
  it('不冒用一般候補順位，改顯示待校方審核並納入候補摘要', () => {
    const query = usePublicRegistrationQuery({
      refreshAvailability: vi.fn(),
      startPolling: vi.fn(),
    })
    query.queryResult.value = {
      id: 1,
      name: '王小明',
      birthday: '2020-05-10',
      courses: [{
        name: '美術',
        status: 'pending_review_waitlist',
        waitlist_position: 3,
      }],
      supplies: [],
    }

    expect(query.statusBadgeFor('美術')).toBe('候補資格待校方審核')
    expect(query.waitlistCourses.value).toHaveLength(1)
  })
})
