// @vitest-environment jsdom
/** F20：三欄救援與 token 查詢共用請求序號，較舊請求的晚回應不得覆寫較新結果。 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const mocks = vi.hoisted(() => ({
  tokenQuery: vi.fn(), identityQuery: vi.fn(),
  bootstrap: vi.fn(), availability: vi.fn(),
}))
vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(), useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/composables/useTenantBranding', () => ({
  useTenantBranding: () => ({ branding: ref({ org_name: '合成園所' }) }),
}))
vi.mock('@/api/activityPublic', () => ({
  publicQueryByToken: mocks.tokenQuery, publicQueryByIdentity: mocks.identityQuery,
  getPublicBootstrap: mocks.bootstrap, getPublicCoursesAvailability: mocks.availability,
  publicUpdateRegistration: vi.fn(), publicConfirmPromotion: vi.fn(), publicDeclinePromotion: vi.fn(),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.bootstrap.mockResolvedValue({ data: {
    courses: [{ name: '合成課', price: 100 }], supplies: [], classes: ['合成班'], course_videos: {},
  } })
  mocks.availability.mockResolvedValue({ data: {} })
})

describe('ActivityPublicQueryView 查詢請求序號（F20）', () => {
  it('較早三欄救援的晚回應不得覆寫較新的查詢碼結果', async () => {
    const { default: QueryView } = await import('@/views/public/ActivityPublicQueryView.vue')
    const detail = (id: number) => ({
      id, name: '合成孩子' + id, birthday: '', class_name: '合成班', school_year: 115, semester: 1,
      parent_phone: '0911111111', courses: [], supplies: [], total_amount: 0, paid_amount: 0,
      query_token_required: true, is_paid: false,
      field_state: { class_editable: false, identity_editable: false },
    })
    const older = deferred<unknown>()
    mocks.identityQuery.mockReturnValue(older.promise)
    mocks.tokenQuery.mockResolvedValue({ data: detail(202) })
    const wrapper = mount(QueryView)
    try {
      await flushPromises()
      await wrapper.find('[data-test="recovery-toggle"]').trigger('click')
      await wrapper.find('#recoveryName').setValue('合成孩子101')
      await wrapper.find('#recoveryClass').setValue('合成班')
      await wrapper.find('#recoveryPhone').setValue('0911111111')
      await wrapper.find('[data-test="recovery-submit"]').trigger('click')
      expect(mocks.identityQuery).toHaveBeenCalledTimes(1)
      await wrapper.find('#searchToken').setValue('synthetic-query-token')
      await wrapper.find('#searchPhone').setValue('0911111111')
      await wrapper.find('[data-test="query-submit"]').trigger('click')
      await flushPromises()
      const state = wrapper.vm as unknown as { queryResult: { id: number }; canMutate: boolean }
      expect(state.queryResult.id).toBe(202)
      expect(state.canMutate).toBe(true)
      older.resolve({ data: { registration: detail(101), token_email_sent: false, masked_email: null } })
      await flushPromises()
      expect(state.queryResult.id).toBe(202)
      expect(state.canMutate).toBe(true)
    } finally { wrapper.unmount() }
  })
})
