/**
 * 新增公告時，公告本體 create 成功後附件上傳失敗：
 * 公告其實已建立，再按一次送出不得再 create 出第二則重複公告，
 * 已成功的附件不得重傳，家長端對象仍要同步；
 * 編輯時刪除附件失敗也不得靜默顯示「公告已更新」。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'

const { createAnnouncement, updateAnnouncement, replaceParent, uploadAtt, deleteAtt, confirmMock, msg } = vi.hoisted(() => ({
  createAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
  replaceParent: vi.fn(),
  uploadAtt: vi.fn(),
  deleteAtt: vi.fn(),
  confirmMock: vi.fn(),
  msg: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

vi.mock('@/api/announcements', () => ({
  getAnnouncements: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
  createAnnouncement: (...a: unknown[]) => createAnnouncement(...a),
  updateAnnouncement: (...a: unknown[]) => updateAnnouncement(...a),
  deleteAnnouncement: vi.fn(),
  getAnnouncementReaders: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
  getAnnouncementParentRecipients: vi.fn().mockResolvedValue({ data: { items: [] } }),
  replaceAnnouncementParentRecipients: (...a: unknown[]) => replaceParent(...a),
  getAnnouncementRecipients: vi.fn().mockResolvedValue({ data: { employee_ids: [] } }),
  uploadAnnouncementAttachment: (...a: unknown[]) => uploadAtt(...a),
  deleteAnnouncementAttachment: (...a: unknown[]) => deleteAtt(...a),
}))

vi.mock('@/api/announcementCategories', () => ({
  getAnnouncementCategories: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
}))

vi.mock('element-plus', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    ElMessage: msg,
    ElMessageBox: { confirm: (...a: unknown[]) => confirmMock(...a) },
  }
})

vi.mock('@/stores/employee', () => ({
  useEmployeeStore: () => ({ employees: [], fetchEmployees: vi.fn() }),
}))
vi.mock('@/stores/classroomAll', () => ({
  useAllClassroomStore: () => ({ classrooms: [], fetchClassrooms: vi.fn() }),
}))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))

import AnnouncementView from '@/views/AnnouncementView.vue'

type Vm = {
  openAdd: () => void
  openEdit: (row: Record<string, unknown>) => Promise<void>
  handleSubmit: () => Promise<void>
  handleAttachmentChange: (f: { uid: number; raw?: File }) => void
  handleAttachmentRemove: (f: { uid: number }) => void
  markAttachmentForDelete: (id: number) => void
  dialogVisible: boolean
  isEdit: boolean
  form: { id: number | null; title: string; content: string; parent_visibility: string }
}

const file = (name: string, size = 100) => {
  const f = new File(['x'], name, { type: 'application/pdf' })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

async function mountView() {
  const wrapper = shallowMount(AnnouncementView, {
    global: { stubs: { teleport: true, 'el-table-column': { template: '<span />' } } },
  })
  await flushPromises()
  return wrapper.vm as unknown as Vm
}

describe('AnnouncementView 附件失敗不重複發佈', () => {
  beforeEach(() => {
    createAnnouncement.mockReset().mockResolvedValue({ data: { id: 9 } })
    updateAnnouncement.mockReset().mockResolvedValue({ data: {} })
    replaceParent.mockReset().mockResolvedValue({ data: {} })
    uploadAtt.mockReset()
    deleteAtt.mockReset()
    confirmMock.mockReset().mockResolvedValue('confirm')
    msg.success.mockReset(); msg.error.mockReset(); msg.warning.mockReset()
  })

  it('create 成功但附件上傳失敗 → 重試走 update 同一則，不再 create；成功的附件不重傳', async () => {
    uploadAtt.mockImplementation((_id: number, f: File) => (
      f.name === 'bad.pdf'
        ? Promise.reject({ response: { status: 413, data: { detail: '檔案過大' } } })
        : Promise.resolve({ data: { id: 501, filename: f.name, mime_type: 'application/pdf', size_bytes: 1, url: '/u', thumb_url: null } })
    ))
    const vm = await mountView()
    vm.openAdd()
    vm.form.title = '停課通知'
    vm.form.content = '明日颱風停課'
    vm.form.parent_visibility = 'all'
    vm.handleAttachmentChange({ uid: 1, raw: file('ok.pdf') })
    vm.handleAttachmentChange({ uid: 2, raw: file('bad.pdf') })

    await vm.handleSubmit()
    await flushPromises()

    expect(createAnnouncement).toHaveBeenCalledTimes(1)
    expect(msg.success).not.toHaveBeenCalled()
    expect(msg.error).toHaveBeenCalled()
    expect(vm.dialogVisible).toBe(true)
    // 公告已存在 → 家長端對象仍要套上
    expect(replaceParent).toHaveBeenCalledWith(9, [{ scope: 'all' }])
    expect(vm.isEdit).toBe(true)
    expect(vm.form.id).toBe(9)

    // 使用者移除失敗的大檔、換一個小檔，再按送出
    vm.handleAttachmentRemove({ uid: 2 })
    vm.handleAttachmentChange({ uid: 3, raw: file('small.pdf') })
    await vm.handleSubmit()
    await flushPromises()

    expect(createAnnouncement).toHaveBeenCalledTimes(1)
    expect(updateAnnouncement).toHaveBeenCalledTimes(1)
    expect(updateAnnouncement.mock.calls[0][0]).toBe(9)
    const uploadedNames = uploadAtt.mock.calls.map(c => (c[1] as File).name)
    expect(uploadedNames).toEqual(['ok.pdf', 'bad.pdf', 'small.pdf'])
    expect(vm.dialogVisible).toBe(false)
  })

  it('選檔超過 10MB 直接擋下，不進待上傳清單', async () => {
    uploadAtt.mockResolvedValue({ data: {} })
    const vm = await mountView()
    vm.openAdd()
    vm.form.title = 't'
    vm.form.content = 'c'
    vm.handleAttachmentChange({ uid: 1, raw: file('big.pdf', 12 * 1024 * 1024) })
    expect(msg.warning).toHaveBeenCalled()
    await vm.handleSubmit()
    await flushPromises()
    expect(uploadAtt).not.toHaveBeenCalled()
  })

  it('編輯時刪除附件失敗 → 不得顯示「公告已更新」並關閉', async () => {
    deleteAtt.mockRejectedValue({ response: { status: 500, data: { detail: 'boom' } } })
    const vm = await mountView()
    await vm.openEdit({
      id: 5, title: '舊', content: '內容', priority: 'normal', is_pinned: false,
      attachments: [{ id: 77, filename: 'a.pdf', mime_type: 'application/pdf', size_bytes: 1, url: '/a', thumb_url: null }],
    })
    await flushPromises()
    vm.markAttachmentForDelete(77)
    await vm.handleSubmit()
    await flushPromises()

    expect(deleteAtt).toHaveBeenCalledWith(5, 77)
    expect(msg.success).not.toHaveBeenCalled()
    expect(msg.error).toHaveBeenCalled()
    expect(vm.dialogVisible).toBe(true)
  })
})
