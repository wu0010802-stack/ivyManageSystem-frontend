/**
 * CourseDmUploader（後台課程 dialog 的 DM 上傳，2026-07-31）。
 *
 * 覆蓋：無 DM 顯示上傳入口與提示文字、有 DM 顯示縮圖＋頁數＋移除鈕、
 * 上傳成功後 emit updated、移除前需 confirm。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElUpload } from 'element-plus'
import type { UploadRawFile } from 'element-plus'

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
    ElMessageBox: { confirm: vi.fn() },
  }
})

vi.mock('@/api/activity', () => ({
  uploadCourseDm: vi.fn(),
  deleteCourseDm: vi.fn(),
}))

import { ElMessage, ElMessageBox } from 'element-plus'
import { uploadCourseDm, deleteCourseDm } from '@/api/activity'
import CourseDmUploader from '../CourseDmUploader.vue'

function mountUploader(props: { courseId: number; dmUrl?: string | null; dmPages?: string[] | null }) {
  return mount(CourseDmUploader, {
    props,
    global: { plugins: [ElementPlus] },
  })
}

function fakeFile(name: string, size = 1024): UploadRawFile {
  const file = new File(['x'.repeat(size)], name) as UploadRawFile
  file.uid = 1
  return file
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CourseDmUploader', () => {
  it('無 DM 時顯示上傳入口與提示文字，不顯示移除鈕', () => {
    const wrapper = mountUploader({ courseId: 1, dmUrl: null, dmPages: null })

    expect(wrapper.text()).toContain('支援 PDF（≤10 頁）或圖片，單檔 ≤ 10MB')
    expect(wrapper.findComponent(ElUpload).exists()).toBe(true)
    expect(wrapper.text()).not.toContain('移除')
  })

  it('有 DM 時顯示第一頁縮圖、頁數與移除鈕', () => {
    const wrapper = mountUploader({
      courseId: 1,
      dmUrl: 'https://example.com/dm.pdf',
      dmPages: ['https://example.com/dm-p1.jpg', 'https://example.com/dm-p2.jpg'],
    })

    const img = wrapper.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('https://example.com/dm-p1.jpg')
    expect(wrapper.text()).toContain('共 2 頁')
    expect(wrapper.text()).toContain('移除')
    expect(wrapper.findComponent(ElUpload).exists()).toBe(false)
  })

  it('上傳成功後呼叫 uploadCourseDm 並 emit updated', async () => {
    vi.mocked(uploadCourseDm).mockResolvedValue({
      data: { dm_url: 'https://example.com/new.pdf', dm_pages: ['https://example.com/new-p1.jpg'] },
    } as never)
    const wrapper = mountUploader({ courseId: 7, dmUrl: null, dmPages: null })

    const upload = wrapper.findComponent(ElUpload)
    const httpRequest = upload.props('httpRequest') as (opts: { file: UploadRawFile }) => Promise<void>
    await httpRequest({ file: fakeFile('dm.pdf') })
    await flushPromises()

    expect(uploadCourseDm).toHaveBeenCalledWith(7, expect.any(File))
    expect(wrapper.emitted('updated')).toBeTruthy()
    expect(wrapper.emitted('updated')![0]).toEqual([
      { dm_url: 'https://example.com/new.pdf', dm_pages: ['https://example.com/new-p1.jpg'] },
    ])
    expect(ElMessage.success).toHaveBeenCalled()
  })

  it('移除前彈出 confirm；確認後呼叫 deleteCourseDm 並 emit updated(null)', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
    vi.mocked(deleteCourseDm).mockResolvedValue({ data: {} } as never)
    const wrapper = mountUploader({
      courseId: 3,
      dmUrl: 'https://example.com/dm.pdf',
      dmPages: ['https://example.com/dm-p1.jpg'],
    })

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(ElMessageBox.confirm).toHaveBeenCalled()
    expect(deleteCourseDm).toHaveBeenCalledWith(3)
    expect(wrapper.emitted('updated')).toBeTruthy()
    expect(wrapper.emitted('updated')![0]).toEqual([{ dm_url: null, dm_pages: null }])
  })

  it('移除取消時不呼叫 deleteCourseDm', async () => {
    vi.mocked(ElMessageBox.confirm).mockRejectedValue('cancel')
    const wrapper = mountUploader({
      courseId: 3,
      dmUrl: 'https://example.com/dm.pdf',
      dmPages: ['https://example.com/dm-p1.jpg'],
    })

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(deleteCourseDm).not.toHaveBeenCalled()
    expect(wrapper.emitted('updated')).toBeFalsy()
  })
})
