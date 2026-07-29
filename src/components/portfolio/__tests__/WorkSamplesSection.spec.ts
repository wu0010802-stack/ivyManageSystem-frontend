import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('@/api/workSamples', () => ({
  listWorkSamples: vi.fn(() =>
    Promise.resolve({
      data: {
        total: 1,
        items: [{
          id: 1, title: '恐龍', work_date: '2026-05-01', domain: '美感',
          description: null, created_by: 9,
          attachments: [{ id: 3, thumb_url: '/t.jpg', display_url: '/d.jpg' }],
        }],
      },
    }),
  ),
  updateWorkSample: vi.fn(),
  deleteWorkSample: vi.fn(() => Promise.resolve({ data: { ok: true } })),
  uploadWorkSamplePhoto: vi.fn(),
}))

import WorkSamplesSection from '../WorkSamplesSection.vue'
import * as workSamplesApi from '@/api/workSamples'

vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn(() => true),
}))

describe('WorkSamplesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('渲染作品清單', async () => {
    const w = mount(WorkSamplesSection, {
      props: { studentId: 1 },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    expect(w.text()).toContain('恐龍')
    expect(w.find('img').attributes('src')).toBe('/t.jpg')
    expect(w.find('img').attributes('alt')).toBe('恐龍')
  })

  it('刪除確認後呼叫 deleteWorkSample 並 reload', async () => {
    const { ElMessageBox } = await import('element-plus')
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    const w = mount(WorkSamplesSection, {
      props: { studentId: 1 },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()

    const deleteBtn = w.findAll('button').find((b) => b.text() === '刪除')!
    await deleteBtn.trigger('click')
    await flushPromises()

    expect(confirmSpy).toHaveBeenCalled()
    expect(workSamplesApi.deleteWorkSample).toHaveBeenCalledWith(1, 1)
    expect(workSamplesApi.listWorkSamples).toHaveBeenCalledTimes(2)
    confirmSpy.mockRestore()
  })

  it('取消刪除確認時不呼叫 deleteWorkSample', async () => {
    const { ElMessageBox } = await import('element-plus')
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
    const w = mount(WorkSamplesSection, {
      props: { studentId: 1 },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()

    const deleteBtn = w.findAll('button').find((b) => b.text() === '刪除')!
    await deleteBtn.trigger('click')
    await flushPromises()

    expect(workSamplesApi.deleteWorkSample).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('編輯 dialog 送出後呼叫 updateWorkSample', async () => {
    const w = mount(WorkSamplesSection, {
      props: { studentId: 1 },
      global: { plugins: [ElementPlus] },
      attachTo: document.body,
    })
    await flushPromises()

    const editBtn = w.findAll('button').find((b) => b.text() === '編輯')!
    await editBtn.trigger('click')
    await flushPromises()

    const saveBtn = document.body.querySelectorAll('.el-dialog__footer button')[1] as HTMLButtonElement
    saveBtn.click()
    await flushPromises()

    expect(workSamplesApi.updateWorkSample).toHaveBeenCalledWith(
      1,
      1,
      expect.objectContaining({ title: '恐龍' }),
    )
    w.unmount()
  })
})
