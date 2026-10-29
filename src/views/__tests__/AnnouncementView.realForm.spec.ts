/**
 * 以真實 Element Plus＋真實 FormDialog／FormSection 掛載公告管理頁並開啟表單，
 * 鎖住 shallowMount 看不到的接線：必填標示、欄位實際渲染順序、FormDialog 送出鈕 → handleSubmit、
 * 標題欄 Enter 不送出、受眾讀取中送出鈕停用。
 *
 * 只有 el-dialog 以穿透 stub 取代（happy-dom 無法渲染 teleport 的 overlay）。
 * ElForm.validate() 在 vitest 下恆回 true，所以這裡不測「驗證失敗」，只測 markup 與接線。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'

const { getAnnouncements, createAnnouncement, getRecipients, msg } = vi.hoisted(() => ({
  getAnnouncements: vi.fn(),
  createAnnouncement: vi.fn(),
  getRecipients: vi.fn(),
  msg: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

vi.mock('@/api/announcements', () => ({
  getAnnouncements: (...a: unknown[]) => getAnnouncements(...a),
  createAnnouncement: (...a: unknown[]) => createAnnouncement(...a),
  updateAnnouncement: vi.fn(),
  deleteAnnouncement: vi.fn(),
  getAnnouncementReaders: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
  getAnnouncementParentRecipients: vi.fn().mockResolvedValue({ data: { items: [] } }),
  replaceAnnouncementParentRecipients: vi.fn().mockResolvedValue({ data: {} }),
  getAnnouncementRecipients: (...a: unknown[]) => getRecipients(...a),
  uploadAnnouncementAttachment: vi.fn(),
  deleteAnnouncementAttachment: vi.fn(),
}))
vi.mock('@/api/announcementCategories', () => ({
  getAnnouncementCategories: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
}))
vi.mock('@/api/students', () => ({ getStudents: vi.fn().mockResolvedValue({ data: { items: [] } }) }))
vi.mock('element-plus', async (orig) => {
  const actual = (await orig()) as { default: unknown; ElMessage: unknown }
  return { ...actual, ElMessage: msg }
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
  form: { title: string; content: string }
}

const ROW = { id: 5, title: '舊公告', content: '舊內容', priority: 'normal', is_pinned: false, status: 'active' }

const mountView = async (): Promise<VueWrapper> => {
  getAnnouncements.mockResolvedValue({ data: { items: [ROW], total: 1 } })
  const wrapper = mount(AnnouncementView, {
    attachTo: document.body,
    global: {
      plugins: [ElementPlus],
      stubs: {
        teleport: true,
        ElDialog: {
          name: 'ElDialog',
          props: ['modelValue'],
          template: '<section v-if="modelValue" role="dialog"><slot /><slot name="footer" /></section>',
        },
      },
    },
  })
  await flushPromises()
  return wrapper
}

const labelOf = (item: Element) => item.querySelector('.el-form-item__label')?.textContent?.trim() ?? ''

beforeEach(() => {
  getAnnouncements.mockReset()
  createAnnouncement.mockReset().mockResolvedValue({ data: { id: 9 } })
  getRecipients.mockReset().mockResolvedValue({ data: { employee_ids: [] } })
  msg.success.mockReset(); msg.error.mockReset(); msg.warning.mockReset()
})

describe('公告表單（真實 Element Plus）', () => {
  it('標題與內容標示為必填，欄位依 標題 → 內容 → 分類／對象 → 發佈設定 排列', async () => {
    const wrapper = await mountView()
    ;(wrapper.vm as unknown as Vm).openAdd()
    await flushPromises()

    const items = Array.from(document.querySelectorAll('.el-form-item'))
    const labels = items.map(labelOf)
    expect(labels.indexOf('標題')).toBeGreaterThanOrEqual(0)
    expect(labels.indexOf('內容')).toBe(labels.indexOf('標題') + 1)
    expect(labels.indexOf('內容')).toBeLessThan(labels.indexOf('分類'))
    expect(labels.indexOf('分類')).toBeLessThan(labels.indexOf('家長端'))
    expect(labels.indexOf('家長端')).toBeLessThan(labels.indexOf('發佈時間'))

    const byLabel = (l: string) => items.find((i) => labelOf(i) === l)
    expect(byLabel('標題')?.classList.contains('is-required')).toBe(true)
    expect(byLabel('內容')?.classList.contains('is-required')).toBe(true)
    expect(byLabel('分類')?.classList.contains('is-required')).toBe(false)
    expect(Array.from(document.querySelectorAll('.form-section__label')).map((e) => e.textContent?.trim())).toEqual([
      '公告內容', '分類與對象', '發佈設定',
    ])
    wrapper.unmount()
  })

  it('FormDialog 的送出鈕接到 handleSubmit，並以 payload 呼叫 createAnnouncement', async () => {
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as Vm
    vm.openAdd()
    vm.form.title = '停課通知'
    vm.form.content = '明日颱風停課'
    await flushPromises()

    const submit = document.querySelector<HTMLButtonElement>('[data-test="form-dialog-submit"]')
    expect(submit?.textContent?.trim()).toBe('發佈公告')
    submit?.click()
    await flushPromises()

    expect(createAnnouncement).toHaveBeenCalledTimes(1)
    expect(createAnnouncement.mock.calls[0][0]).toMatchObject({ title: '停課通知', content: '明日颱風停課' })
    wrapper.unmount()
  })

  it('標題欄按 Enter 不會送出（避免誤按就發佈並通知家長）', async () => {
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as Vm
    vm.openAdd()
    vm.form.title = '停課通知'
    vm.form.content = '明日颱風停課'
    await flushPromises()

    const titleInput = document.querySelector<HTMLInputElement>('input[maxlength="200"]')
    expect(titleInput).not.toBeNull()
    titleInput!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushPromises()
    expect(createAnnouncement).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('編輯時受眾設定尚在讀取：送出鈕停用，讀完才可按', async () => {
    let release!: (v: unknown) => void
    getRecipients.mockReturnValueOnce(new Promise((r) => { release = r }))
    const wrapper = await mountView()
    const pending = (wrapper.vm as unknown as Vm).openEdit(ROW)
    await flushPromises()

    const submit = () => document.querySelector<HTMLButtonElement>('[data-test="form-dialog-submit"]')
    expect(submit()?.disabled).toBe(true)
    expect(document.body.textContent).toContain('正在讀取既有的對象設定')

    release({ data: { employee_ids: [] } })
    await pending
    await flushPromises()
    expect(submit()?.disabled).toBe(false)
    expect(submit()?.textContent?.trim()).toBe('更新公告')
    wrapper.unmount()
  })

  it('編輯時受眾設定讀取失敗：顯示表單內錯誤，送出鈕維持停用', async () => {
    getRecipients.mockRejectedValueOnce(new Error('boom'))
    const wrapper = await mountView()
    await (wrapper.vm as unknown as Vm).openEdit(ROW)
    await flushPromises()

    expect(document.querySelector('[data-test="recipient-load-error"]')).not.toBeNull()
    expect(document.querySelector<HTMLButtonElement>('[data-test="form-dialog-submit"]')?.disabled).toBe(true)
    wrapper.unmount()
  })
})
