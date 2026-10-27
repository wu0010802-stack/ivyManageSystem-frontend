/**
 * 公告對家長公開時，送出會立即（或排程）推播 LINE 且無法收回，
 * 必須先經過確認；取消就不得建立公告。不對家長公開則不打擾。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'

const { createAnnouncement, replaceParent, confirmMock } = vi.hoisted(() => ({
  createAnnouncement: vi.fn(),
  replaceParent: vi.fn(),
  confirmMock: vi.fn(),
}))

vi.mock('@/api/announcements', () => ({
  getAnnouncements: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
  createAnnouncement: (...a: unknown[]) => createAnnouncement(...a),
  updateAnnouncement: vi.fn(),
  deleteAnnouncement: vi.fn(),
  getAnnouncementReaders: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
  getAnnouncementParentRecipients: vi.fn().mockResolvedValue({ data: { items: [] } }),
  replaceAnnouncementParentRecipients: (...a: unknown[]) => replaceParent(...a),
  getAnnouncementRecipients: vi.fn().mockResolvedValue({ data: { employee_ids: [] } }),
  uploadAnnouncementAttachment: vi.fn(),
  deleteAnnouncementAttachment: vi.fn(),
}))

vi.mock('@/api/announcementCategories', () => ({
  getAnnouncementCategories: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
}))

vi.mock('element-plus', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
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
  handleSubmit: () => Promise<void>
  form: { title: string; content: string; parent_visibility: string }
}

async function mountWithDraft(visibility: string) {
  const wrapper = shallowMount(AnnouncementView, {
    global: { stubs: { teleport: true, 'el-table-column': { template: '<span />' } } },
  })
  await flushPromises()
  const vm = wrapper.vm as unknown as Vm
  vm.openAdd()
  vm.form.title = '停課通知'
  vm.form.content = '明日颱風停課'
  vm.form.parent_visibility = visibility
  return vm
}

describe('AnnouncementView 通知家長前確認', () => {
  beforeEach(() => {
    createAnnouncement.mockReset().mockResolvedValue({ data: { id: 9 } })
    replaceParent.mockReset().mockResolvedValue({ data: {} })
    confirmMock.mockReset()
  })

  it('對全部家長公開時先確認；取消則不建立公告', async () => {
    confirmMock.mockRejectedValue('cancel')
    const vm = await mountWithDraft('all')
    await vm.handleSubmit()
    await flushPromises()
    expect(confirmMock).toHaveBeenCalledTimes(1)
    expect(String(confirmMock.mock.calls[0][0])).toContain('全部家長')
    expect(createAnnouncement).not.toHaveBeenCalled()
    expect(replaceParent).not.toHaveBeenCalled()
  })

  it('確認後才建立並設定家長對象', async () => {
    confirmMock.mockResolvedValue('confirm')
    const vm = await mountWithDraft('all')
    await vm.handleSubmit()
    await flushPromises()
    expect(createAnnouncement).toHaveBeenCalledTimes(1)
    expect(replaceParent).toHaveBeenCalledWith(9, [{ scope: 'all' }])
  })

  it('不對家長公開時不跳確認', async () => {
    const vm = await mountWithDraft('off')
    await vm.handleSubmit()
    await flushPromises()
    expect(confirmMock).not.toHaveBeenCalled()
    expect(createAnnouncement).toHaveBeenCalledTimes(1)
  })
})
