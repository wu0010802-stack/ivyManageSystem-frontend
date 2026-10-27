import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('@/api/portal', () => ({
  getMyStudents: vi.fn(() =>
    Promise.resolve({
      data: {
        classrooms: [
          { classroom_name: '小熊班', students: [{ id: 1, name: '王小明' }] },
        ],
      },
    }),
  ),
}))
const createWorkSample = vi.fn(() => Promise.resolve({ data: { id: 99 } }))
const uploadWorkSamplePhoto = vi.fn(() => Promise.resolve({ data: { id: 5 } }))
vi.mock('@/api/workSamples', () => ({
  listWorkSamples: vi.fn(() => Promise.resolve({ data: { total: 0, items: [] } })),
  createWorkSample: (...a: unknown[]) => createWorkSample(...a),
  updateWorkSample: vi.fn(),
  deleteWorkSample: vi.fn(),
  uploadWorkSamplePhoto: (...a: unknown[]) => uploadWorkSamplePhoto(...a),
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))

import PortalWorkSampleView from '../PortalWorkSampleView.vue'
import { getMyStudents } from '@/api/portal'
import { listWorkSamples } from '@/api/workSamples'

// 兩個 it() 共用模組層級的 createWorkSample mock，須在每個測試前清空呼叫紀錄，
// 否則「標題空白不可送出」會誤判成功（沿用 PortalContactBookView.race.test.ts 慣例）。
beforeEach(() => {
  vi.clearAllMocks()
})

describe('PortalWorkSampleView', () => {
  it('載入班級學生並可送出作品', async () => {
    const w = mount(PortalWorkSampleView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.text()).toContain('王小明')
    // 填表單後送出
    const vm = w.vm as unknown as {
      form: { studentId: number | null; title: string; workDate: string }
      submit: () => Promise<void>
    }
    vm.form.studentId = 1
    vm.form.title = '恐龍樂園'
    await vm.submit()
    expect(createWorkSample).toHaveBeenCalledWith(1, expect.objectContaining({ title: '恐龍樂園' }))
  })

  it('標題空白不可送出', async () => {
    const w = mount(PortalWorkSampleView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const vm = w.vm as unknown as { form: { studentId: number | null }; submit: () => Promise<void> }
    vm.form.studentId = 1
    await vm.submit()
    expect(createWorkSample).not.toHaveBeenCalled()
  })

  it('學生名單讀取失敗 → 顯示錯誤與重試，不會永遠「讀取中…」', async () => {
    vi.mocked(getMyStudents).mockRejectedValueOnce(new Error('boom'))
    const w = mount(PortalWorkSampleView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.text()).not.toContain('讀取中')
    const err = w.findComponent({ name: 'PortalErrorState' })
    expect(err.exists()).toBe(true)
    err.vm.$emit('retry')
    await flushPromises()
    expect(w.text()).toContain('王小明')
  })

  it('真的沒有學生 → 說明沒有負責班級，不顯示讀取中', async () => {
    vi.mocked(getMyStudents).mockResolvedValueOnce({ data: { classrooms: [] } } as never)
    const w = mount(PortalWorkSampleView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.text()).toContain('目前沒有你負責班級的學生')
  })

  it('近期作品讀取失敗 → 顯示錯誤，不顯示「尚無作品」', async () => {
    const w = mount(PortalWorkSampleView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    vi.mocked(listWorkSamples).mockRejectedValueOnce(new Error('boom'))
    ;(w.vm as unknown as { form: { studentId: number | null } }).form.studentId = 1
    await flushPromises()
    expect(w.text()).toContain('近期作品讀取失敗')
    expect(w.text()).not.toContain('尚無作品')
  })
})
