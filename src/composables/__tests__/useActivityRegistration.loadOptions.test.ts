import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'

// 2026-06-29 audit P3-G：loadOptions 無 seq/race 守衛（fetchList 有 fetchSeq），
// 學期 A→B 快速切換時較慢回應的舊學期課程會覆寫新學期 courseOptions。

const term = { school_year: 114, semester: 1 }

vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => term,
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: vi.fn() }),
}))

vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
  ElMessageBox: { prompt: vi.fn() },
}))

// getCourses 回 deferred promise（依學期 key），讓測試手動控制亂序回應落地。
const deferreds: Record<string, (v: unknown) => void> = {}
const rejecters: Record<string, (e: unknown) => void> = {}
vi.mock('@/api/activity', () => ({
  getRegistrations: vi.fn(),
  batchUpdatePayment: vi.fn(),
  getClassOptions: vi.fn(() => Promise.resolve({ data: { options: [] } })),
  getCourses: vi.fn((params: { school_year: number; semester: number }) => {
    const key = `${params.school_year}-${params.semester}`
    return new Promise((resolve, reject) => {
      deferreds[key] = resolve
      rejecters[key] = reject
    })
  }),
}))

import { useActivityRegistration } from '@/composables/useActivityRegistration'

type Api = ReturnType<typeof useActivityRegistration>

function hostWithComposable() {
  let api!: Api
  const Comp = defineComponent({
    setup() {
      api = useActivityRegistration()
      return () => null
    },
  })
  mount(Comp)
  return () => api
}

describe('useActivityRegistration.loadOptions race guard', () => {
  beforeEach(() => {
    for (const k of Object.keys(deferreds)) delete deferreds[k]
    for (const k of Object.keys(rejecters)) delete rejecters[k]
    term.school_year = 114
    term.semester = 1
  })

  it('學期快切：舊學期較慢回應不覆寫新學期 courseOptions', async () => {
    const api = hostWithComposable()

    // 第一次：114-1
    term.semester = 1
    const p1 = api().loadOptions()
    // 第二次：114-2（較新）
    term.semester = 2
    const p2 = api().loadOptions()

    // 亂序回應：先回較新的 114-2，再回較舊的 114-1
    deferreds['114-2']({ data: { courses: [{ id: 2, name: '新學期課' }] } })
    deferreds['114-1']({ data: { courses: [{ id: 1, name: '舊學期課' }] } })
    await Promise.all([p1, p2])
    await flushPromises()

    // courseOptions 須為新學期（114-2）；舊回應應被 seq 守衛丟棄
    expect(api().courseOptions.value).toEqual([{ id: 2, name: '新學期課' }])
  })

  it('切學期載入失敗：清空 courseOptions（不保留舊學期課程）', async () => {
    // 2026-06-29 audit F4：失敗時保留舊 courseOptions 會在篩選器 / 新增課程視窗展示
    // 錯誤學期資料；修正後失敗應清空。
    const api = hostWithComposable()

    // 第一次：114-1 成功，courseOptions 有舊學期課
    term.semester = 1
    const p1 = api().loadOptions()
    deferreds['114-1']({ data: { courses: [{ id: 1, name: '舊學期課' }] } })
    await p1
    await flushPromises()
    expect(api().courseOptions.value).toEqual([{ id: 1, name: '舊學期課' }])

    // 第二次：114-2 載入失敗 → courseOptions 應清空
    term.semester = 2
    const p2 = api().loadOptions()
    rejecters['114-2'](new Error('boom'))
    await p2.catch(() => {})
    await flushPromises()

    expect(api().courseOptions.value).toEqual([])
  })
})
