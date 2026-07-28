/**
 * 學期評量／事件紀錄列表寫死 limit=100 且無分頁，第 101 筆之後永遠看不到
 * （bug-hunt 2026-07-27）。
 *
 * 兩支 view 都送 `limit: 100`、全檔沒有 skip/page/el-pagination，卻在下方顯示
 * 後端回的未截斷 total。畫面於是寫著「共 350 筆紀錄」但表格只有 100 列，
 * 沒有分頁器也沒有「載入更多」。
 *
 * 單班 30 人 × 3 種評量 × 7 領域，一學期就破 100；就算把篩選器用滿，
 * 最細切片仍可能 210 筆。後端 api/portal/assessments.py 與 incidents.py 早就支援
 * skip/limit（le=200），純粹是前端沒接。
 *
 * 管理端 src/views/StudentAssessmentView.vue 的 currentPage/pageSize → skip/limit
 * → el-pagination 才是既有慣例。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

// 兩支 view 是直接用 api.get('/portal/my-students')，不是 @/api/portal 的 helper
vi.mock('@/api/index', () => ({
  default: {
    get: vi.fn().mockResolvedValue({
      data: {
        classrooms: [{ classroom_id: 11, classroom_name: '小班', students: [] }],
      },
    }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

vi.mock('@/api/studentAssessments', () => ({
  getMyClassAssessments: vi
    .fn()
    .mockResolvedValue({ data: { items: [], total: 350 } }),
  createAssessment: vi.fn(),
  updateAssessment: vi.fn(),
  deleteAssessment: vi.fn(),
}))

vi.mock('@/api/studentIncidents', () => ({
  getMyClassIncidents: vi
    .fn()
    .mockResolvedValue({ data: { items: [], total: 350 } }),
  createIncident: vi.fn(),
  updateIncident: vi.fn(),
  deleteIncident: vi.fn(),
}))

import { getMyClassAssessments } from '@/api/studentAssessments'
import { getMyClassIncidents } from '@/api/studentIncidents'

type PagedParams = { skip?: number; limit?: number }

async function mountView(path: string) {
  const mod = await import(path)
  const wrapper = mount(mod.default, { global: { plugins: [ElementPlus] } })
  await flushPromises()
  return wrapper
}

describe('教師端列表分頁', () => {
  beforeEach(() => {
    vi.mocked(getMyClassAssessments).mockClear()
    vi.mocked(getMyClassIncidents).mockClear()
  })

  it('評量列表：初次查詢要帶 skip=0 與可分頁的 limit', async () => {
    await mountView('@/views/portal/PortalAssessmentView.vue')

    const params = vi.mocked(getMyClassAssessments).mock.calls[0][0] as PagedParams
    expect(params.skip).toBe(0)
    expect(params.limit).toBeLessThanOrEqual(200)
  })

  it('評量列表：換頁時 skip 要跟著走，才看得到第 101 筆之後', async () => {
    const wrapper = await mountView('@/views/portal/PortalAssessmentView.vue')
    const vm = wrapper.vm as unknown as { currentPage: number; pageSize: number }
    const size = vm.pageSize

    vm.currentPage = 2
    await flushPromises()

    const calls = vi.mocked(getMyClassAssessments).mock.calls
    const last = calls[calls.length - 1][0] as PagedParams
    expect(last.skip).toBe(size)
  })

  it('事件列表：初次查詢要帶 skip=0', async () => {
    await mountView('@/views/portal/PortalIncidentView.vue')

    const params = vi.mocked(getMyClassIncidents).mock.calls[0][0] as PagedParams
    expect(params.skip).toBe(0)
  })

  it('事件列表：換頁時 skip 要跟著走', async () => {
    const wrapper = await mountView('@/views/portal/PortalIncidentView.vue')
    const vm = wrapper.vm as unknown as { currentPage: number; pageSize: number }
    const size = vm.pageSize

    vm.currentPage = 3
    await flushPromises()

    const calls = vi.mocked(getMyClassIncidents).mock.calls
    const last = calls[calls.length - 1][0] as PagedParams
    expect(last.skip).toBe(size * 2)
  })
})
