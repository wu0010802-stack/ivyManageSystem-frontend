/**
 * ContactBookDetailView hero 重排（P3 mockup 落位）：裝飾插畫 + mood-lg 容器 +
 * mood-tag chip。沿用既有 ContactBookDetailView.raceGuard.test.ts 的 mock 慣例。
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import ContactBookHeroSparkle from '@/parent/components/illustrations/ContactBookHeroSparkle.vue'

const mockEntry = {
  id: 100,
  log_date: '2026-08-10',
  mood: 'happy',
  meal_lunch: 3,
  nap_minutes: 90,
  teacher_note: '今天表現很棒',
  photos: [],
  replies: [],
  readAt: null,
  isRead: false,
}

vi.mock('@/parent/api/contactBook', () => ({
  getContactBookDetail: vi.fn().mockResolvedValue({ data: mockEntry }),
  ackContactBook: vi.fn().mockResolvedValue({ data: { readAt: '2026-08-10T10:00:00Z' } }),
  replyContactBook: vi.fn(),
  deleteContactBookReply: vi.fn(),
}))
vi.mock('@/parent/stores/children', () => ({
  useChildrenStore: () => ({ items: [{ student_id: 1, name: '小明', classroom_name: '中班' }], load: vi.fn() }),
}))
vi.mock('@/parent/utils/parentOfflineQueue', () => ({
  enqueueParent: vi.fn(),
  flushParentQueue: vi.fn().mockResolvedValue(undefined),
}))

async function mountDetail() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/contact-book/:entryId', component: { template: '<div/>' } }],
  })
  router.push('/contact-book/100')
  await router.isReady()
  const ContactBookDetailView = (await import('@/parent/views/ContactBookDetailView.vue')).default
  const wrapper = mount(ContactBookDetailView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

describe('ContactBookDetailView — hero 重排（P3）', () => {
  it('渲染裝飾插畫', async () => {
    const w = await mountDetail()
    expect(w.findComponent(ContactBookHeroSparkle).exists()).toBe(true)
  })

  it('mood-lg 容器包住 MoodBadge', async () => {
    const w = await mountDetail()
    expect(w.find('.mood-lg').exists()).toBe(true)
  })

  it('mood-tag 顯示心情文字', async () => {
    const w = await mountDetail()
    const tag = w.find('.mood-tag')
    expect(tag.exists()).toBe(true)
    expect(tag.text()).toContain('開心')
  })

  it('心情只在 hero 出現，故事列表不再重複「今日心情」', async () => {
    const w = await mountDetail()
    expect(w.find('.timeline-card').text()).not.toContain('今日心情')
    expect(w.find('.timeline-card').text()).toContain('午餐')
  })

  it('老師留言排在飲食／午睡等數據之前', async () => {
    const w = await mountDetail()
    const cards = w.findAll('section.card').map((c) => c.classes())
    const noteIdx = cards.findIndex((c) => c.includes('note-card'))
    const timelineIdx = cards.findIndex((c) => c.includes('timeline-card'))
    expect(noteIdx).toBeGreaterThanOrEqual(0)
    expect(noteIdx).toBeLessThan(timelineIdx)
  })
})
