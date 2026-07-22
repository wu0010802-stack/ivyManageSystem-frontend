import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'

// ── 模擬 vue-router（view 用 useRouter().push 導去查詢頁）─────────────────
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// ── 模擬 API：bootstrap / availability 皆可控制何時 resolve，
//    以便斷言 initState==='loading' 期間的中間態 DOM ────────────────────────
vi.mock('@/api/activityPublic', () => ({
  getPublicBootstrap: vi.fn(),
  getPublicCoursesAvailability: vi.fn(),
  publicRegister: vi.fn(),
}))

import { getPublicBootstrap, getPublicCoursesAvailability } from '@/api/activityPublic'

/** 建一組可外部控制 resolve 時機的 deferred promise */
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const mountView = async (): Promise<VueWrapper> => {
  const ActivityPublicView = (await import('../ActivityPublicView.vue')).default
  return mount(ActivityPublicView, {
    global: {
      stubs: ['router-link', 'router-view'],
    },
  })
}

describe('ActivityPublicView — 初始化 loading 期間不誤閃「報名尚未開放」', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initState===loading 時不渲染報名表單欄位，也不顯示「報名尚未開放」banner', async () => {
    const bootstrapDeferred = deferred<{ data: unknown }>()
    const availabilityDeferred = deferred<{ data: unknown }>()
    vi.mocked(getPublicBootstrap).mockReturnValue(bootstrapDeferred.promise as never)
    vi.mocked(getPublicCoursesAvailability).mockReturnValue(availabilityDeferred.promise as never)

    const wrapper = await mountView()
    // onMounted 內的 runInit 已呼叫 API 但兩支 promise 都還沒 resolve → 仍在 loading

    // ① 不應出現報名表單欄位（幼兒姓名 input 為代表）
    expect(wrapper.find('#studentName').exists()).toBe(false)
    // ① 不應出現「報名尚未開放」（loading 期間 timeInfo 仍是預設值 is_open:false 算出的誤導文案）
    expect(wrapper.text()).not.toContain('報名尚未開放')
    expect(wrapper.find('.notice').exists()).toBe(false)
    // 應顯示中性載入態
    expect(wrapper.find('.init-loading-panel').exists()).toBe(true)
    // 不應誤顯示初始化失敗面板
    expect(wrapper.find('.init-error-panel').exists()).toBe(false)

    // 收尾：resolve 掉 pending promise 避免 unhandled rejection 污染其他測試
    bootstrapDeferred.resolve({ data: { courses: [], supplies: [], classes: [], course_videos: {} } })
    availabilityDeferred.resolve({ data: {} })
    await new Promise((r) => setTimeout(r, 0))
  })

  it('API resolve 後 initState===ready，報名表單與真實 banner 正常出現', async () => {
    vi.mocked(getPublicBootstrap).mockResolvedValue({
      data: {
        courses: [{ name: '美術', price: 3000 }],
        supplies: [],
        classes: ['大班'],
        course_videos: {},
        registration_time: { is_open: false, open_at: null, close_at: null },
      },
    } as never)
    vi.mocked(getPublicCoursesAvailability).mockResolvedValue({ data: {} } as never)

    const wrapper = await mountView()
    // flush pending microtasks/promises triggered by onMounted → runInit
    await new Promise((r) => setTimeout(r, 0))
    await wrapper.vm.$nextTick()

    // ② ready 後表單欄位出現
    expect(wrapper.find('#studentName').exists()).toBe(true)
    // ② ready 後真實 banner 出現（本測試 bootstrap 回傳 is_open:false → 真實狀態確實是「尚未開放」，
    //    此處驗證的是「resolve 後才出現」，而非「永遠不出現」）
    expect(wrapper.find('.notice').exists()).toBe(true)
    expect(wrapper.text()).toContain('報名尚未開放')
    // loading 面板應已消失
    expect(wrapper.find('.init-loading-panel').exists()).toBe(false)
  })
})
