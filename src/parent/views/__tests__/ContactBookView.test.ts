/**
 * ContactBookView — friendly error 接入 watch(cbError, ...) 的 toast 行為。
 *
 * 用 mock useAbortableFetch 暴露 error ref 直接 set 後驗證 toast 被 friendly message + nextStep 呼叫。
 */
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import ContactBookView from '../ContactBookView.vue'

// ===== hoisted mocks =====
// vi.mock factory 會 hoist 到檔案頂端，所有引用的物件必須走 vi.hoisted；
// 為了讓 watch(cbError, ...) 真的觸發，這裡用 await import('vue') 拿真 ref。
const { mockToast, mockRefresh, mockChildrenLoad, mockCbError, mockCbBundle } = await vi.hoisted(async () => {
  const { ref } = await import('vue')
  return {
    mockToast: {
      success: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    },
    mockRefresh: vi.fn(),
    mockChildrenLoad: vi.fn(),
    mockCbError: ref<unknown>(null),
    mockCbBundle: ref<unknown>(null),
  }
})

vi.mock('@/parent/utils/toast', () => ({
  toast: mockToast,
}))

vi.mock('@/parent/composables/useAbortableFetch', () => ({
  useAbortableFetch: () => ({
    data: mockCbBundle,
    error: mockCbError,
    pending: ref(false),
    refresh: mockRefresh,
  }),
}))

vi.mock('@/parent/composables/useChildSelection', () => ({
  useChildSelection: () => ({
    selectedId: ref(1),
    ensureSelected: vi.fn(),
  }),
}))

vi.mock('@/parent/composables/useIncrementalRender', () => ({
  useIncrementalRender: () => ({
    visible: ref([]),
    sentinelRef: ref(null),
    hasMore: ref(false),
  }),
}))

vi.mock('@/parent/api/contactBook', () => ({
  getTodayContactBook: vi.fn().mockResolvedValue({ data: { entry: null } }),
  listContactBook: vi.fn().mockResolvedValue({ data: { entries: [] } }),
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
vi.mock('@/components/brand/KawaiiStar.vue', () => ({
  default: { template: '<span />' },
}))
vi.mock('@/components/common/MobileErrorRetry.vue', () => ({
  default: {
    template: '<div data-testid="mobile-error-retry"><button @click="$emit(\'retry\')">重試</button></div>',
    emits: ['retry'],
  },
}))
vi.mock('@/parent/components/SectionHeader.vue', () => ({
  default: { template: '<div data-testid="section-header"><slot name="action" /></div>' },
}))
vi.mock('@/parent/components/StatusPill.vue', () => ({
  default: { template: '<span data-testid="status-pill" />' },
}))

function createTestRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
}

function mountCbView() {
  return mount(ContactBookView, {
    global: {
      plugins: [createPinia(), createTestRouter()],
    },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  Object.values(mockToast).forEach((fn) => fn.mockReset())
  mockCbError.value = null
  mockCbBundle.value = { today: null, entries: [] }
  mockRefresh.mockReset()
  mockChildrenLoad.mockReset().mockResolvedValue(undefined)
})

describe('ContactBookView — friendly error watch', () => {
  it('CONTACT_BOOK_NOT_PUBLISHED → toast.info 顯示 message + nextStep', async () => {
    const w = mountCbView()
    await flushPromises()
    mockCbError.value = {
      isAxiosError: true,
      response: { status: 404 },
      errorDetail: { code: 'CONTACT_BOOK_NOT_PUBLISHED', message: '今日聯絡簿尚未發布' },
      displayMessage: '今日聯絡簿尚未發布',
    }
    await flushPromises()
    expect(mockToast.info).toHaveBeenCalledTimes(1)
    const arg = mockToast.info.mock.calls[0]![0]
    expect(arg).toContain('今日聯絡簿尚未發布')
    expect(arg).toMatch(/老師通常於下午|聯絡老師/)
    expect(w.exists()).toBe(true)
  })

  it('STUDENT_NOT_LINKED_TO_PARENT → toast.error level', async () => {
    const w = mountCbView()
    await flushPromises()
    mockCbError.value = {
      isAxiosError: true,
      response: { status: 403 },
      errorDetail: { code: 'STUDENT_NOT_LINKED_TO_PARENT', message: '您無權存取此學生資料' },
      displayMessage: '您無權存取此學生資料',
    }
    await flushPromises()
    expect(mockToast.error).toHaveBeenCalledTimes(1)
    expect(mockToast.error.mock.calls[0]![0]).toMatch(/聯絡園所確認綁定關係/)
    expect(w.exists()).toBe(true)
  })

  it('未知 code → toast.error 顯示 displayMessage 不含 nextStep 分隔符', async () => {
    const w = mountCbView()
    await flushPromises()
    mockCbError.value = {
      isAxiosError: true,
      response: { status: 500 },
      errorDetail: null,
      displayMessage: '伺服器爆了',
    }
    await flushPromises()
    expect(mockToast.error).toHaveBeenCalledTimes(1)
    expect(mockToast.error.mock.calls[0]![0]).toBe('伺服器爆了')
    expect(w.exists()).toBe(true)
  })
})

describe('ContactBookView — inline MobileErrorRetry', () => {
  it('fetch 失敗且無資料時渲染 MobileErrorRetry', async () => {
    // 預設 mockCbBundle = { today: null, entries: [] }（hasNoData = true）
    const w = mountCbView()
    await flushPromises()

    // 設定 error — 觸發 watch(cbError) + hasNoData 條件
    mockCbError.value = {
      isAxiosError: true,
      response: { status: 500 },
      errorDetail: null,
      displayMessage: '伺服器錯誤',
    }
    await flushPromises()

    expect(w.find('[data-testid="mobile-error-retry"]').exists()).toBe(true)
  })

  it('有資料時即使 fetch 錯誤也不渲染 MobileErrorRetry', async () => {
    // 給 bundle 一筆 today 資料 → hasNoData = false
    mockCbBundle.value = {
      today: { id: 1, log_date: '2026-06-24', isRead: true },
      entries: [],
    }
    const w = mountCbView()
    await flushPromises()

    mockCbError.value = {
      isAxiosError: true,
      response: { status: 500 },
      errorDetail: null,
      displayMessage: '伺服器錯誤',
    }
    await flushPromises()

    expect(w.find('[data-testid="mobile-error-retry"]').exists()).toBe(false)
  })

  it('點擊重試呼叫 fetchAll（refresh）', async () => {
    const w = mountCbView()
    await flushPromises()

    mockCbError.value = {
      isAxiosError: true,
      response: { status: 503 },
      errorDetail: null,
      displayMessage: '服務不可用',
    }
    await flushPromises()

    const btn = w.find('[data-testid="mobile-error-retry"] button')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    // fetchAll 內部呼叫 refreshCb（mockRefresh）
    expect(mockRefresh).toHaveBeenCalled()
  })
})
