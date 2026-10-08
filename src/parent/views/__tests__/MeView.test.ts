import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import MeView from '../MeView.vue'

// ===== Module mocks (hoisted) =====
const { mockDownloadExport } = vi.hoisted(() => ({
  mockDownloadExport: vi.fn(),
}))

// Use a Vue ref so template reactivity works correctly (auto-unwrap in template)
const mockDownloading = ref(false)

vi.mock('@/parent/composables/useDataExport', () => ({
  useDataExport: () => ({
    downloading: mockDownloading,
    downloadExport: mockDownloadExport,
  }),
}))

// Stub heavy child components that require store / API setup
vi.mock('@/parent/components/more/UserHeroCard.vue', () => ({
  default: { template: '<div data-testid="user-hero-card" />' },
}))
vi.mock('@/parent/components/me/ChildrenList.vue', () => ({
  default: { template: '<div data-testid="children-list" />' },
}))
vi.mock('@/parent/components/more/AppearanceSettings.vue', () => ({
  default: { template: '<div data-testid="appearance-settings" />' },
}))

// Stub API calls used in useCachedAsync
vi.mock('@/parent/api/profile', () => ({
  getHomeSummary: vi.fn().mockResolvedValue({ data: { me: null, summary: {} } }),
  getMyChildren: vi.fn().mockResolvedValue({ data: { items: [] } }),
}))
vi.mock('@/parent/api/auth', () => ({
  logout: vi.fn().mockResolvedValue({}),
}))

// ===== Helpers =====
function createTestRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
}

function mountMeView() {
  return mount(MeView, {
    global: {
      plugins: [createPinia(), createTestRouter()],
      stubs: { Teleport: true, Transition: true },
    },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  mockDownloadExport.mockReset()
  mockDownloading.value = false
})

// ===== Tests =====
describe('MeView — 下載個人資料 button', () => {
  it('renders 下載我的個人資料 button', () => {
    const w = mountMeView()
    expect(w.text()).toContain('下載我的個人資料')
    expect(w.find('[data-testid="open-export-dialog"]').exists()).toBe(true)
  })

  it('opens export dialog when button is clicked', async () => {
    const w = mountMeView()
    // Dialog body not shown before opening
    expect(w.text()).not.toContain('每小時限下載 1 次')

    await w.find('[data-testid="open-export-dialog"]').trigger('click')
    await flushPromises()

    expect(w.text()).toContain('每小時限下載 1 次')
    expect(w.find('[data-testid="confirm-export"]').exists()).toBe(true)
  })

  it('calls downloadExport and closes dialog on success', async () => {
    mockDownloadExport.mockResolvedValue({ ok: true })
    const w = mountMeView()

    await w.find('[data-testid="open-export-dialog"]').trigger('click')
    await flushPromises()

    await w.find('[data-testid="confirm-export"]').trigger('click')
    await flushPromises()

    expect(mockDownloadExport).toHaveBeenCalledOnce()
    // Dialog closed after success — confirm button no longer shown
    expect(w.find('[data-testid="confirm-export"]').exists()).toBe(false)
  })

  it('shows rate_limited error message', async () => {
    mockDownloadExport.mockResolvedValue({ ok: false, reason: 'rate_limited' })
    const w = mountMeView()

    await w.find('[data-testid="open-export-dialog"]').trigger('click')
    await flushPromises()

    await w.find('[data-testid="confirm-export"]').trigger('click')
    await flushPromises()

    expect(w.text()).toContain('請於稍後再試')
    // Dialog stays open
    expect(w.find('[data-testid="confirm-export"]').exists()).toBe(true)
  })

  it('shows too_large error message', async () => {
    mockDownloadExport.mockResolvedValue({ ok: false, reason: 'too_large' })
    const w = mountMeView()

    await w.find('[data-testid="open-export-dialog"]').trigger('click')
    await flushPromises()

    await w.find('[data-testid="confirm-export"]').trigger('click')
    await flushPromises()

    expect(w.text()).toContain('50MB')
    expect(w.find('[data-testid="confirm-export"]').exists()).toBe(true)
  })
})

describe('MeView 入口收斂（2026-09-02）', () => {
  it('不再顯示費用摘要卡', () => {
    const w = mountMeView()
    // FeeSummaryCard 的 vi.mock 已移除（Task 8 會刪掉該元件檔），
    // 因此改以真實元件的根 class 與標題斷言；沿用 mock 的 data-testid
    // 會在元件仍存在時假綠（該元件本身並沒有那個 data-testid）。
    expect(w.find('.fee-summary-card').exists()).toBe(false)
    expect(w.text()).not.toContain('繳費中心')
  })

  it('偏好清單不再有「費用查詢」', () => {
    const w = mountMeView()
    expect(w.text()).not.toContain('費用查詢')
  })

  it('偏好清單新增「常見問題」，連到 /assistant', () => {
    const w = mountMeView()
    expect(w.text()).toContain('常見問題')
    expect(w.find('a[href="/assistant"]').exists()).toBe(true)
  })
})
