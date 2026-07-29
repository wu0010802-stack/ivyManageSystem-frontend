import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const availabilityMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  startPolling: vi.fn(),
  stopPolling: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/api/activityPublic', () => ({
  getPublicBootstrap: vi.fn(),
  publicRegister: vi.fn(),
}))

vi.mock('@/composables/usePublicActivityOptions', async () => {
  const { ref } = await import('vue')
  const courses = ref([])
  const supplies = ref([])
  const classes = ref<string[]>([])
  const videos = ref({})

  return {
    usePublicActivityOptions: () => ({
      courses,
      supplies,
      classes,
      videos,
      loading: ref(false),
      applyOptions: (payload: {
        courses: unknown[]
        supplies: unknown[]
        classes: string[]
        videos: Record<string, unknown>
      }) => {
        courses.value = payload.courses
        supplies.value = payload.supplies
        classes.value = payload.classes
        videos.value = payload.videos
      },
    }),
  }
})

vi.mock('@/composables/useActivityRegistrationTime', async () => {
  const { ref } = await import('vue')
  const timeInfo = ref({ is_open: false, open_at: null, close_at: null })

  return {
    useActivityRegistrationTime: () => ({
      timeInfo,
      applyTime: (payload: typeof timeInfo.value) => {
        timeInfo.value = payload
      },
    }),
  }
})

vi.mock('@/composables/useActivityAvailability', async () => {
  const { ref } = await import('vue')
  return {
    useActivityAvailability: () => ({
      availability: ref({}),
      refresh: availabilityMocks.refresh,
      startPolling: availabilityMocks.startPolling,
      stopPolling: availabilityMocks.stopPolling,
    }),
  }
})

vi.mock('@/composables/useRegistrationWindow', async () => {
  const { ref } = await import('vue')
  return {
    useRegistrationWindow: () => ({
      noticeState: ref({
        title: '報名尚未開放',
        message: '請於開放時間再回來',
        variant: 'warning',
      }),
      isRegistrationOpen: ref(false),
      submitButtonLabel: ref('尚未開放'),
      submitButtonDisabled: ref(true),
    }),
  }
})

vi.mock('@/composables/usePublicRegistrationForm', async () => {
  const { reactive, ref } = await import('vue')
  return {
    usePublicRegistrationForm: () => ({
      form: reactive({
        name: '',
        birthday: '',
        parent_phone: '',
        class_name: '',
        email: '',
        selectedCourses: [] as string[],
        selectedSupplies: [] as string[],
      }),
      errors: reactive({}),
      phoneTouched: ref(false),
      parentPhoneError: ref(''),
      maxBirthdayISO: ref('2026-01-01'),
      minBirthdayISO: ref('2018-01-01'),
      feePreview: ref({
        courseCount: 0,
        supplyCount: 0,
        coursesTotal: 0,
        suppliesTotal: 0,
        total: 0,
        waitlistCount: 0,
      }),
      validatePersonalDetails: vi.fn(),
      validateSelections: vi.fn(),
      validateForm: vi.fn(),
      clearError: vi.fn(),
      toggleCourse: vi.fn(),
      toggleSupply: vi.fn(),
      resetForm: vi.fn(),
      normalizeMobile: vi.fn((value: string) => value),
      FIELD_FOCUS_ORDER: [],
    }),
  }
})

vi.mock('@/composables/usePublicRegistrationFlow', async () => {
  const { ref } = await import('vue')
  return {
    usePublicRegistrationFlow: () => ({
      currentStep: ref(1),
      highestVisitedStep: ref(1),
      goToStep: vi.fn(),
      completeStep: vi.fn(),
      goToErrorField: vi.fn(),
      resetFlow: vi.fn(),
    }),
  }
})

vi.mock('@/composables/useCourseAdvisory', async () => {
  const { ref } = await import('vue')
  return {
    useCourseAdvisory: () => ({
      formatSchedule: vi.fn(),
      courseAdvisory: vi.fn(),
      selectedAdvisories: ref([]),
      availabilityState: vi.fn(),
    }),
  }
})

import { getPublicBootstrap } from '@/api/activityPublic'
import ActivityPublicView from '../ActivityPublicView.vue'

const bootstrapResponse = {
  data: {
    courses: [],
    supplies: [],
    classes: ['幼幼班'],
    course_videos: {},
    registration_time: {
      is_open: true,
      open_at: null,
      close_at: null,
    },
  },
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

async function mountView(): Promise<VueWrapper> {
  const wrapper = shallowMount(ActivityPublicView)
  await flushPromises()
  return wrapper
}

describe('ActivityPublicView 初始化失敗', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    availabilityMocks.refresh.mockResolvedValue(undefined)
  })

  it('bootstrap 失敗時只顯示錯誤，不顯示報名時段 notice，也不啟動輪詢', async () => {
    vi.mocked(getPublicBootstrap).mockRejectedValueOnce(new Error('bootstrap failed'))

    const wrapper = await mountView()

    expect(wrapper.find('.init-error-panel').exists()).toBe(true)
    expect(wrapper.find('.notice').exists()).toBe(false)
    expect(availabilityMocks.startPolling).not.toHaveBeenCalled()
  })

  it('首次失敗後，成功重試才啟動輪詢', async () => {
    vi.mocked(getPublicBootstrap)
      .mockRejectedValueOnce(new Error('bootstrap failed'))
      .mockResolvedValueOnce(bootstrapResponse)

    const wrapper = await mountView()
    expect(availabilityMocks.startPolling).not.toHaveBeenCalled()

    await wrapper.get('.init-error-panel button').trigger('click')
    await flushPromises()

    expect(wrapper.find('.init-error-panel').exists()).toBe(false)
    expect(availabilityMocks.startPolling).toHaveBeenCalledTimes(1)
  })

  it('bootstrap 尚未完成就卸載時，遲到的成功回應不得重新啟動輪詢', async () => {
    const bootstrap = deferred<typeof bootstrapResponse>()
    vi.mocked(getPublicBootstrap).mockReturnValueOnce(bootstrap.promise)

    const wrapper = shallowMount(ActivityPublicView)
    wrapper.unmount()
    bootstrap.resolve(bootstrapResponse)
    await flushPromises()

    expect(availabilityMocks.startPolling).not.toHaveBeenCalled()
  })

  it('重試尚未完成就卸載時，遲到的成功回應不得重新啟動輪詢', async () => {
    const retryBootstrap = deferred<typeof bootstrapResponse>()
    vi.mocked(getPublicBootstrap)
      .mockRejectedValueOnce(new Error('bootstrap failed'))
      .mockReturnValueOnce(retryBootstrap.promise)

    const wrapper = await mountView()
    await wrapper.get('.init-error-panel button').trigger('click')
    wrapper.unmount()
    retryBootstrap.resolve(bootstrapResponse)
    await flushPromises()

    expect(availabilityMocks.startPolling).not.toHaveBeenCalled()
  })
})
