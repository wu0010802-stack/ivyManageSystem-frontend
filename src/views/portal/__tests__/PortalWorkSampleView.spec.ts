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
})
