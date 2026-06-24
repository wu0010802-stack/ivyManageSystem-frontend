/**
 * ChildProfileView 子區三態測試（Task 12）
 *
 * 涵蓋：
 *  - timeline 子區：loading → SkeletonBlock / error → MobileErrorRetry / empty / 成功
 *  - photos 子區：loading → SkeletonBlock / error → MobileErrorRetry / empty / 成功
 *  - 主 profile 載入：loading → SkeletonBlock / 成功顯示資料
 *
 * 不變式：
 *  - useChildTimeline 的 reload(false) 被 MobileErrorRetry retry 觸發
 *  - loadPhotos 被 MobileErrorRetry retry 觸發
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

// ── 可控 mock：timeline composable ────────────────────────────────────────────
const timelineItemsRef = ref<unknown[]>([])
const timelineLoadingRef = ref(false)
const timelineErrorRef = ref<string | null>(null)
const timelineReloadMock = vi.fn()
const timelineLoadMoreMock = vi.fn()
const timelineNextCursorRef = ref<string | null>(null)

vi.mock('@/parent/composables/useChildTimeline', () => ({
  useChildTimeline: () => ({
    items: timelineItemsRef,
    loading: timelineLoadingRef,
    error: timelineErrorRef,
    reload: timelineReloadMock,
    loadMore: timelineLoadMoreMock,
    nextCursor: timelineNextCursorRef,
  }),
}))

// ── 可控 mock：photos API ──────────────────────────────────────────────────────
const fetchChildPhotosMock = vi.fn()
vi.mock('@/parent/api/childPhotos', () => ({
  fetchChildPhotos: (...args: unknown[]) => fetchChildPhotosMock(...args),
}))

// ── 可控 mock：profile API ────────────────────────────────────────────────────
const getChildProfileMock = vi.fn()
vi.mock('@/parent/api/profile', () => ({
  getChildProfile: (...args: unknown[]) => getChildProfileMock(...args),
  getMyChildren: vi.fn().mockResolvedValue({ data: { items: [] } }),
}))

vi.mock('@/parent/utils/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { studentId: '1' } }),
  useRouter: () => ({ push: vi.fn() }),
}))

// 元件 stubs：heavy 元件直接 stub 掉
const STUBS = {
  MilestoneCarousel: true,
  TimelineItem: true,
  LaurelWreath: true,
  KawaiiStar: true,
  CrownIcon: true,
  ParentIcon: true,
  SectionHeader: { template: '<div class="section-header-stub"><slot name="action" /></div>' },
}

// 成功 profile 回應
const SUCCESS_PROFILE = {
  data: {
    student: { name: '小明', student_no: 'S001', gender: '男', birthday: '2020-01-01' },
    teachers: [{ role: 'homeroom', label: '導師', name: '王老師' }],
    guardians: [{ id: 1, name: '王大明', relation: '父親', is_self: true, is_primary: true, can_pickup: true }],
    allergies: [],
    classroom: { name: '向日葵班' },
  },
}

// 成功 photos 回應
const SUCCESS_PHOTOS = {
  data: {
    items: [
      { id: 1, thumb_url: '/img/1.jpg' },
      { id: 2, thumb_url: '/img/2.jpg' },
    ],
  },
}

beforeEach(() => {
  // 重設 timeline 狀態
  timelineItemsRef.value = []
  timelineLoadingRef.value = false
  timelineErrorRef.value = null
  timelineNextCursorRef.value = null
  timelineReloadMock.mockReset()
  timelineLoadMoreMock.mockReset()

  // 重設 API mocks
  fetchChildPhotosMock.mockReset()
  getChildProfileMock.mockReset()
})

describe('ChildProfileView — timeline 子區三態（Task 12）', () => {
  it('timeline loading 時顯示 SkeletonBlock（非純文字「載入中…」）', async () => {
    getChildProfileMock.mockResolvedValue(SUCCESS_PROFILE)
    fetchChildPhotosMock.mockResolvedValue(SUCCESS_PHOTOS)
    // timeline 設為 loading 狀態，無資料
    timelineLoadingRef.value = true
    timelineItemsRef.value = []

    setActivePinia(createPinia())
    const ChildProfileView = (await import('@/parent/views/ChildProfileView.vue')).default
    const w = mount(ChildProfileView, {
      global: { stubs: STUBS },
    })
    await flushPromises()

    expect(w.findComponent({ name: 'SkeletonBlock' }).exists()).toBe(true)
    // 不應有純文字「載入中…」在 timeline 區
    expect(w.html()).not.toContain('<div class="empty">載入中')

    w.unmount()
  })

  it('timeline 錯誤時顯示 MobileErrorRetry（非純文字「載入失敗」）', async () => {
    getChildProfileMock.mockResolvedValue(SUCCESS_PROFILE)
    fetchChildPhotosMock.mockResolvedValue(SUCCESS_PHOTOS)
    // timeline 錯誤狀態，無資料
    timelineErrorRef.value = '載入失敗'
    timelineItemsRef.value = []
    timelineLoadingRef.value = false

    setActivePinia(createPinia())
    const ChildProfileView = (await import('@/parent/views/ChildProfileView.vue')).default
    const w = mount(ChildProfileView, {
      global: { stubs: STUBS },
    })
    await flushPromises()

    const errComp = w.findComponent({ name: 'MobileErrorRetry' })
    expect(errComp.exists()).toBe(true)

    w.unmount()
  })

  it('timeline 錯誤重試：點 MobileErrorRetry 內按鈕觸發 reloadTimeline(false)', async () => {
    getChildProfileMock.mockResolvedValue(SUCCESS_PROFILE)
    fetchChildPhotosMock.mockResolvedValue(SUCCESS_PHOTOS)
    timelineErrorRef.value = '載入失敗'
    timelineItemsRef.value = []
    timelineLoadingRef.value = false

    setActivePinia(createPinia())
    const ChildProfileView = (await import('@/parent/views/ChildProfileView.vue')).default
    const w = mount(ChildProfileView, {
      global: { stubs: STUBS },
    })
    await flushPromises()

    const errComp = w.findComponent({ name: 'MobileErrorRetry' })
    expect(errComp.exists()).toBe(true)

    await errComp.find('button').trigger('click')
    await flushPromises()

    // reloadTimeline(false) 應被呼叫
    expect(timelineReloadMock).toHaveBeenCalledWith(false)

    w.unmount()
  })

  it('timeline empty：「最近沒有動態」仍出現', async () => {
    getChildProfileMock.mockResolvedValue(SUCCESS_PROFILE)
    fetchChildPhotosMock.mockResolvedValue(SUCCESS_PHOTOS)
    timelineItemsRef.value = []
    timelineLoadingRef.value = false
    timelineErrorRef.value = null

    setActivePinia(createPinia())
    const ChildProfileView = (await import('@/parent/views/ChildProfileView.vue')).default
    const w = mount(ChildProfileView, {
      global: { stubs: STUBS },
    })
    await flushPromises()

    expect(w.html()).toContain('最近沒有動態')
    expect(w.findComponent({ name: 'SkeletonBlock' }).exists()).toBe(false)
    expect(w.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(false)

    w.unmount()
  })

  it('timeline 成功載入：SkeletonBlock 與 MobileErrorRetry 皆不存在（profile loading skeleton 也無）', async () => {
    getChildProfileMock.mockResolvedValue(SUCCESS_PROFILE)
    fetchChildPhotosMock.mockResolvedValue(SUCCESS_PHOTOS)
    // timeline 已有資料
    timelineItemsRef.value = [{ id: 1, title: '動態', occurred_at: '2026-01-01', is_highlight: false }]
    timelineLoadingRef.value = false
    timelineErrorRef.value = null

    setActivePinia(createPinia())
    const ChildProfileView = (await import('@/parent/views/ChildProfileView.vue')).default
    const w = mount(ChildProfileView, {
      global: { stubs: STUBS },
    })
    await flushPromises()

    // timeline 有資料後不應顯示 skeleton 或 error（照片也成功故只有 profile skeleton 在 data 前一瞬）
    // profile 已載入，整體無 skeleton 也無 error
    const skeletons = w.findAllComponents({ name: 'SkeletonBlock' })
    const errors = w.findAllComponents({ name: 'MobileErrorRetry' })
    expect(skeletons.length).toBe(0)
    expect(errors.length).toBe(0)

    w.unmount()
  })
})

describe('ChildProfileView — photos 子區三態（Task 12）', () => {
  it('photos loading 時顯示 SkeletonBlock', async () => {
    getChildProfileMock.mockResolvedValue(SUCCESS_PROFILE)
    // photos 永不 resolve
    fetchChildPhotosMock.mockReturnValue(new Promise(() => {}))
    timelineItemsRef.value = []
    timelineLoadingRef.value = false

    setActivePinia(createPinia())
    const ChildProfileView = (await import('@/parent/views/ChildProfileView.vue')).default
    const w = mount(ChildProfileView, {
      global: { stubs: STUBS },
    })
    // 讓 profile 先完成；photos 仍 pending
    await flushPromises()

    // photosLoading=true 時應有 SkeletonBlock
    expect(w.findComponent({ name: 'SkeletonBlock' }).exists()).toBe(true)
    // 不應有純文字「載入中…」
    expect(w.html()).not.toContain('class="placeholder small"')

    w.unmount()
  })

  it('photos 錯誤時顯示 MobileErrorRetry', async () => {
    getChildProfileMock.mockResolvedValue(SUCCESS_PROFILE)
    fetchChildPhotosMock.mockRejectedValue(new Error('網路錯誤'))
    timelineItemsRef.value = []
    timelineLoadingRef.value = false

    setActivePinia(createPinia())
    const ChildProfileView = (await import('@/parent/views/ChildProfileView.vue')).default
    const w = mount(ChildProfileView, {
      global: { stubs: STUBS },
    })
    await flushPromises()

    const errComp = w.findComponent({ name: 'MobileErrorRetry' })
    expect(errComp.exists()).toBe(true)

    w.unmount()
  })

  it('photos 錯誤重試：點 MobileErrorRetry 內按鈕觸發 loadPhotos 重新呼叫', async () => {
    getChildProfileMock.mockResolvedValue(SUCCESS_PROFILE)
    // 第一次 reject，第二次 resolve（模擬重試成功）
    fetchChildPhotosMock
      .mockRejectedValueOnce(new Error('網路錯誤'))
      .mockResolvedValueOnce(SUCCESS_PHOTOS)
    timelineItemsRef.value = []
    timelineLoadingRef.value = false

    setActivePinia(createPinia())
    const ChildProfileView = (await import('@/parent/views/ChildProfileView.vue')).default
    const w = mount(ChildProfileView, {
      global: { stubs: STUBS },
    })
    await flushPromises()

    // 第一次失敗 → MobileErrorRetry
    const errComp = w.findComponent({ name: 'MobileErrorRetry' })
    expect(errComp.exists()).toBe(true)
    expect(fetchChildPhotosMock).toHaveBeenCalledTimes(1)

    // 重試
    await errComp.find('button').trigger('click')
    await flushPromises()

    // fetchChildPhotos 應再次被呼叫（共 2 次）
    expect(fetchChildPhotosMock).toHaveBeenCalledTimes(2)
    // 重試成功後 MobileErrorRetry 消失
    expect(w.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(false)

    w.unmount()
  })

  it('photos empty：「尚無照片」仍出現', async () => {
    getChildProfileMock.mockResolvedValue(SUCCESS_PROFILE)
    fetchChildPhotosMock.mockResolvedValue({ data: { items: [] } })
    timelineItemsRef.value = []
    timelineLoadingRef.value = false

    setActivePinia(createPinia())
    const ChildProfileView = (await import('@/parent/views/ChildProfileView.vue')).default
    const w = mount(ChildProfileView, {
      global: { stubs: STUBS },
    })
    await flushPromises()

    expect(w.html()).toContain('尚無照片')
    expect(w.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(false)

    w.unmount()
  })

  it('photos 成功載入後照片顯示、SkeletonBlock 和 MobileErrorRetry 皆不存在', async () => {
    getChildProfileMock.mockResolvedValue(SUCCESS_PROFILE)
    fetchChildPhotosMock.mockResolvedValue(SUCCESS_PHOTOS)
    timelineItemsRef.value = []
    timelineLoadingRef.value = false

    setActivePinia(createPinia())
    const ChildProfileView = (await import('@/parent/views/ChildProfileView.vue')).default
    const w = mount(ChildProfileView, {
      global: { stubs: STUBS },
    })
    await flushPromises()

    expect(w.findComponent({ name: 'SkeletonBlock' }).exists()).toBe(false)
    expect(w.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(false)
    // 照片清單應渲染
    expect(w.findAll('.strip-thumb').length).toBeGreaterThan(0)

    w.unmount()
  })
})

describe('ChildProfileView — 主 profile 載入三態（Task 12）', () => {
  it('profile loading 時顯示 SkeletonBlock（card variant）', async () => {
    // profile 永不 resolve（loading=true, data=null → SkeletonBlock 顯示）
    getChildProfileMock.mockReturnValue(new Promise(() => {}))
    // photos 也永不 resolve，確保 photosLoading=true 也貢獻一個 SkeletonBlock
    fetchChildPhotosMock.mockReturnValue(new Promise(() => {}))
    timelineItemsRef.value = []
    timelineLoadingRef.value = false

    setActivePinia(createPinia())
    const ChildProfileView = (await import('@/parent/views/ChildProfileView.vue')).default
    const w = mount(ChildProfileView, {
      global: { stubs: STUBS },
    })
    // nextTick 讓 onMounted 中的 loading.value=true 反應到 DOM
    await nextTick()

    // loading=true && data===null → 顯示 SkeletonBlock（card）
    expect(w.findComponent({ name: 'SkeletonBlock' }).exists()).toBe(true)

    w.unmount()
  })

  it('profile 成功後顯示 child-hero 與姓名', async () => {
    getChildProfileMock.mockResolvedValue(SUCCESS_PROFILE)
    fetchChildPhotosMock.mockResolvedValue(SUCCESS_PHOTOS)
    timelineItemsRef.value = []
    timelineLoadingRef.value = false

    setActivePinia(createPinia())
    const ChildProfileView = (await import('@/parent/views/ChildProfileView.vue')).default
    const w = mount(ChildProfileView, {
      global: { stubs: STUBS },
    })
    await flushPromises()

    expect(w.find('.child-name').text()).toBe('小明')
    expect(w.find('.child-meta').text()).toBe('向日葵班')

    w.unmount()
  })

  it('profile 載入失敗時顯示 MobileErrorRetry，不空白降級', async () => {
    getChildProfileMock.mockRejectedValue({ displayMessage: '連線失敗' })
    fetchChildPhotosMock.mockResolvedValue({ data: { items: [] } })
    timelineItemsRef.value = []
    timelineLoadingRef.value = false

    setActivePinia(createPinia())
    const ChildProfileView = (await import('@/parent/views/ChildProfileView.vue')).default
    const w = mount(ChildProfileView, {
      global: { stubs: STUBS },
    })
    await flushPromises()

    // data 未載入 → child-hero 不應顯示
    expect(w.find('.child-hero').exists()).toBe(false)
    // 應顯示 MobileErrorRetry 而非空白
    const errComp = w.findComponent({ name: 'MobileErrorRetry' })
    expect(errComp.exists()).toBe(true)

    w.unmount()
  })

  it('profile 錯誤重試：點 MobileErrorRetry 按鈕觸發 fetchData 再次呼叫', async () => {
    // 第一次 reject，第二次 resolve
    getChildProfileMock
      .mockRejectedValueOnce({ displayMessage: '連線失敗' })
      .mockResolvedValueOnce(SUCCESS_PROFILE)
    fetchChildPhotosMock.mockResolvedValue(SUCCESS_PHOTOS)
    timelineItemsRef.value = []
    timelineLoadingRef.value = false

    setActivePinia(createPinia())
    const ChildProfileView = (await import('@/parent/views/ChildProfileView.vue')).default
    const w = mount(ChildProfileView, {
      global: { stubs: STUBS },
    })
    await flushPromises()

    // 第一次失敗 → MobileErrorRetry 顯示
    const errComp = w.findComponent({ name: 'MobileErrorRetry' })
    expect(errComp.exists()).toBe(true)

    // 重試
    await errComp.find('button').trigger('click')
    await flushPromises()

    // 重試成功 → profile 顯示，error 消失
    expect(w.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(false)
    expect(w.find('.child-name').text()).toBe('小明')

    w.unmount()
  })
})
