import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { mount } from '@vue/test-utils'

/**
 * 2026-08-06 稽核：放棄候補原本在「頁內二段確認」之後又跳一次原生
 * window.confirm，連續兩次確認；且原生對話框按取消時頁內確認區已被收掉
 * （confirmDeclinePromotion 會先清 pendingDeclineFor），使用者完全沒有回饋。
 *
 * 本檔守衛兩件事：
 *  1. 放棄流程不得再觸發原生 window.confirm（頁內二段確認是唯一閘門）
 *  2. 使用者在頁內確認按「保留候補」時不打 API，且狀態完整復原（不卡 loading）
 */

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/api/activityPublic', () => ({
  publicQueryByToken: vi.fn(),
  publicQueryByIdentity: vi.fn(),
  publicUpdateRegistration: vi.fn(),
  publicConfirmPromotion: vi.fn(),
  publicDeclinePromotion: vi.fn(),
  getPublicBootstrap: vi.fn().mockResolvedValue({
    data: { courses: [], supplies: [], classes: ['大班'], course_videos: {} },
  }),
  getPublicCoursesAvailability: vi.fn().mockResolvedValue({ data: {} }),
  getPublicRegistrationTime: vi.fn().mockResolvedValue({ data: {} }),
}))

import { publicDeclinePromotion, publicQueryByToken } from '@/api/activityPublic'
import { usePromotionActions } from '@/composables/usePromotionActions'
import type {
  CourseEntry,
  QueryCredentials,
  QueryResult,
} from '@/composables/usePublicRegistrationQuery'

// production 的候補待確認列：status=promoted_pending 且 confirm_deadline 必有值
// （usePromotionActions.pendingPromotions 兩者皆要求），course_id 由後端必填。
const PENDING_COURSE: CourseEntry = {
  course_id: 7,
  name: '美術',
  price: 1200,
  status: 'promoted_pending',
  confirm_deadline: '2026-08-10T18:00:00',
}

function makeQueryResult(): QueryResult {
  return {
    id: 1,
    name: '王小明',
    birthday: '2020-01-01',
    class_name: '大班',
    courses: [PENDING_COURSE],
    supplies: [],
    total_amount: 1200,
    paid_amount: 0,
    query_token_required: true,
    is_paid: false,
  }
}

const CREDENTIALS: QueryCredentials = {
  token: 'TESTTOKEN123',
  name: '王小明',
  birthday: '2020-01-01',
  parent_phone: '0912345678',
}

function setupActions() {
  const queryResult = ref<QueryResult | null>(makeQueryResult())
  const activeQueryCredentials = ref<QueryCredentials | null>({ ...CREDENTIALS })
  const activeQueryToken = computed(() => activeQueryCredentials.value?.token ?? null)
  const showToast = vi.fn()
  const actions = usePromotionActions({
    queryResult,
    activeQueryCredentials,
    activeQueryToken,
    refetchCurrent: vi.fn().mockResolvedValue(makeQueryResult()),
    createHydrationGuard: () => ({
      requestId: 1,
      registrationId: 1,
      credentials: { ...CREDENTIALS },
    }),
    hydrateResult: vi.fn(() => true),
    showToast,
  })
  return { actions, showToast, queryResult, activeQueryCredentials }
}

describe('usePromotionActions — 放棄候補不再跳原生 confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('放棄候補全程不呼叫 window.confirm（頁內二段確認是唯一閘門）', async () => {
    const confirmSpy = vi.fn(() => true)
    // happy-dom 無 window.confirm，需 stubGlobal 才能觀測是否被呼叫
    vi.stubGlobal('confirm', confirmSpy)
    vi.mocked(publicDeclinePromotion).mockResolvedValue({
      data: { message: '已放棄該名額' },
    })
    const { actions } = setupActions()

    await actions.handleDeclinePromotion(PENDING_COURSE)

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(publicDeclinePromotion).toHaveBeenCalledTimes(1)
  })

  it('原生 confirm 即使回 false 也不再擋下放棄（不存在第二道原生閘門）', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false))
    vi.mocked(publicDeclinePromotion).mockResolvedValue({
      data: { message: '已放棄該名額' },
    })
    const { actions, showToast } = setupActions()

    await actions.handleDeclinePromotion(PENDING_COURSE)

    expect(publicDeclinePromotion).toHaveBeenCalledTimes(1)
    expect(showToast.mock.calls.map((c) => c[0]).join('|')).toContain('已放棄該名額')
    expect(actions.promotionSubmitting.value).toBeNull()
  })

  it('放棄失敗時狀態復原，按鈕不卡在處理中', async () => {
    vi.mocked(publicDeclinePromotion).mockRejectedValue({
      response: { data: { detail: '此名額已逾期回收' } },
    })
    const { actions, showToast } = setupActions()

    await actions.handleDeclinePromotion(PENDING_COURSE)

    expect(actions.promotionSubmitting.value).toBeNull()
    expect(showToast).toHaveBeenCalledWith('此名額已逾期回收', 'error')
  })

  it('憑證失效的早退分支不會把狀態留在處理中', async () => {
    const { actions, activeQueryCredentials } = setupActions()
    activeQueryCredentials.value = null

    await actions.handleDeclinePromotion(PENDING_COURSE)

    expect(publicDeclinePromotion).not.toHaveBeenCalled()
    expect(actions.promotionSubmitting.value).toBeNull()
  })
})

// ── 頁內二段確認的實際互動（放棄鍵 → 就地確認 → 確定／保留）──────────────
const mountView = async () => {
  const ActivityPublicQueryView = (await import('@/views/public/ActivityPublicQueryView.vue'))
    .default
  return mount(ActivityPublicQueryView, {
    global: { stubs: ['router-link', 'router-view'] },
  })
}

type ViewWrapper = Awaited<ReturnType<typeof mountView>>

async function triggerTokenQuery(wrapper: ViewWrapper) {
  wrapper.vm.queryForm.token = 'TESTTOKEN123'
  wrapper.vm.queryForm.parent_phone = '0912345678'
  await wrapper.vm.$nextTick()
  await wrapper.find('[data-test="query-submit"]').trigger('click')
  await new Promise((r) => setTimeout(r, 0))
}

function findButtonByText(wrapper: ViewWrapper, text: string) {
  const btn = wrapper.findAll('button').find((b) => b.text().includes(text))
  expect(btn, `找不到按鈕「${text}」`).toBeTruthy()
  return btn!
}

describe('ActivityPublicQueryView — 放棄候補只有頁內一段二段確認', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(publicQueryByToken).mockResolvedValue({ data: makeQueryResult() })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('按「確定放棄」即送出放棄請求，不再彈出原生對話框', async () => {
    // 原生 confirm 回 false：修復前會在此靜默中止（頁內確認區已收掉＝毫無回饋）
    const confirmSpy = vi.fn(() => false)
    vi.stubGlobal('confirm', confirmSpy)
    vi.mocked(publicDeclinePromotion).mockResolvedValue({
      data: { message: '已放棄該名額' },
    })

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    await findButtonByText(wrapper, '放棄此位').trigger('click')
    expect(wrapper.find('[data-test="decline-confirm"]').exists()).toBe(true)

    await findButtonByText(wrapper, '確定放棄').trigger('click')
    await new Promise((r) => setTimeout(r, 0))

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(publicDeclinePromotion).toHaveBeenCalledTimes(1)
  })

  it('按「保留候補」取消：不呼叫 API，確認區收合、按鈕回到可操作狀態', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    await findButtonByText(wrapper, '放棄此位').trigger('click')
    expect(wrapper.find('[data-test="decline-confirm"]').exists()).toBe(true)

    await findButtonByText(wrapper, '保留候補').trigger('click')
    await new Promise((r) => setTimeout(r, 0))

    expect(publicDeclinePromotion).not.toHaveBeenCalled()
    expect(wrapper.find('[data-test="decline-confirm"]').exists()).toBe(false)
    // 狀態復原：放棄鍵重新出現且未卡在 loading
    const declineBtn = findButtonByText(wrapper, '放棄此位')
    expect(declineBtn.attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).not.toContain('處理中…')
  })
})
