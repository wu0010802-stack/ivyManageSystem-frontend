/**
 * tests/unit/views/portal/applyFormDeepLink.spec.ts
 *
 * Phase 3：ApplySheet（底部＋）導頁帶 ?new=1，三個申請頁進頁自動開表單，
 * 免去「進頁後再點一次新增」；並以 router.replace 清掉 query，
 * 重新整理不會又彈表單。
 *
 * 每個 view 各驗：(a) ?new=1 → 手機 bottom sheet 直開 (b) 無 query → 不開。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'

// ---- vue-router mock：query 可逐測試變更 ----
const { mockRoute, routerReplace, routerPush } = vi.hoisted(() => ({
  mockRoute: { params: {}, query: {} as Record<string, string> },
  routerReplace: vi.fn(),
  routerPush: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
}))

// ---- 手機模式固定開啟（sheet 分支才會渲染） ----
vi.mock('@/composables/useIsMobile', () => ({
  useIsMobile: () => ({ isMobile: ref(true), cleanup: () => {} }),
}))

// ---- 三個 view 匯入的 @/api/portal 函式聯集 ----
vi.mock('@/api/portal', () => ({
  // leave
  getMyColleagues: vi.fn(() => Promise.resolve({ data: [] })),
  getMyLeaveStats: vi.fn(() => Promise.resolve({ data: {} })),
  getMySubstituteRequests: vi.fn(() => Promise.resolve({ data: [] })),
  respondToSubstitute: vi.fn(),
  // overtime
  getMyOvertimes: vi.fn(() => Promise.resolve({ data: [] })),
  createMyOvertime: vi.fn(),
  deleteMyOvertime: vi.fn(),
  // punch
  getMyPunchCorrections: vi.fn(() => Promise.resolve({ data: [] })),
  createMyPunchCorrection: vi.fn(),
}))

// ---- 重型子元件以模組路徑 mock（阻斷它們自己的 API import 鏈） ----
vi.mock('@/components/portal/TeacherBottomSheet.vue', () => ({
  default: {
    name: 'TeacherBottomSheet',
    props: ['modelValue', 'title', 'snapPoints', 'defaultSnap'],
    template: '<div v-if="modelValue" class="sheet-open" :data-title="title"><slot /></div>',
  },
}))
vi.mock('@/components/portal/PortalLeaveForm.vue', () => ({
  default: { name: 'PortalLeaveForm', props: ['allEmployees'], template: '<div class="leave-form-stub" />' },
}))
vi.mock('@/components/portal/PortalLeaveList.vue', () => ({
  default: { name: 'PortalLeaveList', props: ['refreshTrigger'], template: '<div />' },
}))
vi.mock('@/components/portal/PortalSubstituteCardList.vue', () => ({
  default: { name: 'PortalSubstituteCardList', props: ['items', 'loading'], template: '<div />' },
}))
vi.mock('@/components/portal/PortalOvertimeForm.vue', () => ({
  default: { name: 'PortalOvertimeForm', props: ['loading'], template: '<div class="overtime-form-stub" />' },
}))
vi.mock('@/components/portal/PortalPunchCorrectionForm.vue', () => ({
  default: { name: 'PortalPunchCorrectionForm', props: ['loading'], template: '<div class="punch-form-stub" />' },
}))
vi.mock('@/components/common/AdminListCards.vue', () => ({
  default: { name: 'AdminListCards', props: ['items', 'columns', 'rowKey'], template: '<div />' },
}))

import PortalLeaveView from '@/views/portal/PortalLeaveView.vue'
import PortalOvertimeView from '@/views/portal/PortalOvertimeView.vue'
import PortalPunchCorrectionView from '@/views/portal/PortalPunchCorrectionView.vue'

const CASES = [
  ['PortalLeaveView', PortalLeaveView],
  ['PortalOvertimeView', PortalOvertimeView],
  ['PortalPunchCorrectionView', PortalPunchCorrectionView],
] as const

async function mountView(view: (typeof CASES)[number][1]) {
  setActivePinia(createPinia())
  const wrapper = mount(view, {
    global: { plugins: [ElementPlus], stubs: { teleport: true } },
  })
  await flushPromises()
  return wrapper
}

describe.each(CASES)('%s — ?new=1 直開表單', (_name, view) => {
  beforeEach(() => {
    routerReplace.mockClear()
    mockRoute.query = {}
  })

  it('(a) 帶 ?new=1 進頁自動開表單並清掉 query', async () => {
    mockRoute.query = { new: '1' }
    const wrapper = await mountView(view)
    expect(wrapper.find('.sheet-open').exists()).toBe(true)
    expect(routerReplace).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.objectContaining({ new: undefined }) }),
    )
    wrapper.unmount()
  })

  it('(b) 無 query 不開表單', async () => {
    const wrapper = await mountView(view)
    expect(wrapper.find('.sheet-open').exists()).toBe(false)
    expect(routerReplace).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
