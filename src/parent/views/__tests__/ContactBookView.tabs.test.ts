/**
 * ContactBookView 上方分頁（聯絡簿 / 公告）。
 *
 * 訊息功能下架（2026-08-28）後，原本掛在「訊息」tab 的公告曾併進聯絡簿頁的
 * 第二個分頁；2026-09-08 起「公告」分頁按鈕先從畫面移除，隨後僅剩、且恆常
 * active、點了無作用的「聯絡簿」分頁按鈕也一併移除，畫面上已無任何分頁按鈕。
 * 深連結 `?tab=announcements`（LINE 推播用）與 AnnouncementsPanel 資料邏輯
 * 刻意保留。此檔驗證：畫面上不存在任何分頁按鈕、深連結仍可直接落在公告分頁。
 */
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import ContactBookView from '../ContactBookView.vue'

const { mockToast, mockRefresh, mockChildrenLoad, mockCbError, mockCbBundle } = await vi.hoisted(async () => {
  const { ref } = await import('vue')
  return {
    mockToast: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    mockRefresh: vi.fn(),
    mockChildrenLoad: vi.fn(),
    mockCbError: ref<unknown>(null),
    mockCbBundle: ref<unknown>(null),
  }
})

vi.mock('@/parent/utils/toast', () => ({ toast: mockToast }))

vi.mock('@/parent/composables/useAbortableFetch', () => ({
  useAbortableFetch: () => ({
    data: mockCbBundle,
    error: mockCbError,
    pending: ref(false),
    refresh: mockRefresh,
  }),
}))

vi.mock('@/parent/composables/useChildSelection', () => ({
  useChildSelection: () => ({ selectedId: ref(1), ensureSelected: vi.fn() }),
}))

vi.mock('@/parent/composables/useIncrementalRender', () => ({
  useIncrementalRender: () => ({ visible: ref([]), sentinelRef: ref(null), hasMore: ref(false) }),
}))

vi.mock('@/parent/api/contactBook', () => ({
  getTodayContactBook: vi.fn().mockResolvedValue({ data: { entry: null } }),
  listContactBook: vi.fn().mockResolvedValue({ data: { entries: [] } }),
}))

vi.mock('@/parent/api/announcements', () => ({
  getUnreadCount: vi.fn().mockResolvedValue({ data: { unread_count: 0 } }),
  listAnnouncements: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
  markRead: vi.fn().mockResolvedValue({ data: {} }),
}))

vi.mock('@/parent/stores/children', () => ({
  useChildrenStore: () => ({
    items: [{ student_id: 1, name: '小明', classroom_name: '蘋果班' }],
    load: mockChildrenLoad,
  }),
}))

vi.mock('@/parent/components/ChildContextHeader.vue', () => ({
  default: { template: '<div data-testid="cb-header" />' },
}))
vi.mock('@/parent/components/SkeletonBlock.vue', () => ({
  default: { template: '<div data-testid="skeleton" />' },
}))
vi.mock('@/parent/components/contact-book/MonthDateStrip.vue', () => ({
  default: { template: '<div data-testid="month-strip" />' },
}))
vi.mock('@/parent/components/contact-book/ContactBookDayCard.vue', () => ({
  default: { template: '<div data-testid="day-card" />' },
}))
vi.mock('@/parent/components/contact-book/ContactBookListItem.vue', () => ({
  default: { template: '<div data-testid="list-item" />' },
}))
vi.mock('@/components/common/EmptyState.vue', () => ({
  default: { template: '<div data-testid="empty" />' },
}))
vi.mock('@/components/brand/KawaiiStar.vue', () => ({ default: { template: '<span />' } }))
vi.mock('@/components/common/MobileErrorRetry.vue', () => ({
  default: { template: '<div data-testid="mobile-error-retry" />' },
}))
vi.mock('@/parent/components/SectionHeader.vue', () => ({
  default: { template: '<div data-testid="section-header"><slot name="action" /></div>' },
}))
vi.mock('@/parent/components/StatusPill.vue', () => ({
  default: { template: '<span data-testid="status-pill" />' },
}))

// 公告面板：抽出成獨立元件後，聯絡簿頁與 /announcements 共用同一份。
vi.mock('@/parent/components/announcements/AnnouncementsPanel.vue', () => ({
  default: {
    template: '<div data-testid="ann-panel" />',
    emits: ['unread-change'],
  },
}))

function createTestRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
}

async function mountCbView(initialPath = '/contact-book') {
  const router = createTestRouter()
  router.push(initialPath)
  await router.isReady()
  const w = mount(ContactBookView, {
    global: { plugins: [createPinia(), router] },
  })
  await flushPromises()
  return { w, router }
}

beforeEach(() => {
  setActivePinia(createPinia())
  Object.values(mockToast).forEach((fn) => fn.mockReset())
  mockCbError.value = null
  mockCbBundle.value = { today: null, entries: [] }
  mockRefresh.mockReset()
  mockChildrenLoad.mockReset().mockResolvedValue(undefined)
})

describe('ContactBookView 上方分頁（聯絡簿 / 公告）', () => {
  it('預設顯示聯絡簿分頁：日期條在、公告面板不掛載', async () => {
    const { w } = await mountCbView()
    expect(w.find('[data-testid="month-strip"]').exists()).toBe(true)
    expect(w.find('[data-testid="ann-panel"]').exists()).toBe(false)
  })

  it('分頁按鈕已完全移除，畫面上不存在任何分頁按鈕', async () => {
    const { w } = await mountCbView()
    expect(w.findAll('[data-testid="cb-segment-tab"]')).toHaveLength(0)
  })

  it('深連結 ?tab=announcements 直接開在公告分頁（資料邏輯保留，只是沒有可見入口能點進來）', async () => {
    const { w } = await mountCbView('/contact-book?tab=announcements')
    expect(w.find('[data-testid="ann-panel"]').exists()).toBe(true)
    expect(w.find('[data-testid="month-strip"]').exists()).toBe(false)
  })
})
