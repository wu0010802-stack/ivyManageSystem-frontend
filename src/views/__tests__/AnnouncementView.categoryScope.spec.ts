/**
 * 公告分類欄位整合 ＋ 受眾範圍獨立權限碼（anncat01）。
 *
 * - 新增公告表單預設帶入 tenant 的 is_default 分類。
 * - ANNOUNCEMENTS_SCHOOL_WRITE／ANNOUNCEMENTS_CLASS_WRITE 缺碼時，對應的
 *   parent_visibility 選項（all／classroom）應被停用；指定學生（custom）不受影響。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'

// vi.mock 工廠會被 hoist 到檔案最上方，工廠內引用的常數／mock fn 一律用
// vi.hoisted 宣告，避免 const 初始化順序造成的 TDZ ReferenceError。
const { CATEGORIES, hasPermissionMock } = vi.hoisted(() => ({
  CATEGORIES: [
    { id: 1, name: '一般', icon: 'campaign', color: '#4EB87A', is_default: false, sort_order: 0, announcement_count: 0 },
    { id: 2, name: '緊急', icon: 'warning', color: '#F56C6C', is_default: true, sort_order: 1, announcement_count: 0 },
  ],
  hasPermissionMock: vi.fn(
    (code: string) => code !== 'ANNOUNCEMENTS_SCHOOL_WRITE' && code !== 'ANNOUNCEMENTS_CLASS_WRITE',
  ),
}))

vi.mock('@/api/announcements', () => ({
  getAnnouncements: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
  createAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
  deleteAnnouncement: vi.fn(),
  getAnnouncementReaders: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
  getAnnouncementParentRecipients: vi.fn().mockResolvedValue({ data: { recipients: [] } }),
  replaceAnnouncementParentRecipients: vi.fn(),
  getAnnouncementRecipients: vi.fn().mockResolvedValue({ data: { recipient_ids: [] } }),
  uploadAnnouncementAttachment: vi.fn(),
  deleteAnnouncementAttachment: vi.fn(),
}))

vi.mock('@/api/announcementCategories', () => ({
  getAnnouncementCategories: vi.fn().mockResolvedValue({ data: { items: CATEGORIES, total: CATEGORIES.length } }),
  createAnnouncementCategory: vi.fn(),
  updateAnnouncementCategory: vi.fn(),
  deleteAnnouncementCategory: vi.fn(),
}))

vi.mock('element-plus', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn() },
  }
})

vi.mock('@/stores/employee', () => ({
  useEmployeeStore: () => ({ employees: [], fetchEmployees: vi.fn() }),
}))
vi.mock('@/stores/classroomAll', () => ({
  useAllClassroomStore: () => ({ classrooms: [], fetchClassrooms: vi.fn() }),
}))

vi.mock('@/utils/auth', () => ({ hasPermission: (code: string) => hasPermissionMock(code) }))

import AnnouncementView from '@/views/AnnouncementView.vue'

const globalConfig = {
  stubs: { teleport: true, 'el-table-column': { template: '<span />' } },
}

type Vm = {
  openAdd: () => void
  form: { category_id: number | null; parent_visibility: string }
  canScopeSchool: boolean
  canScopeClass: boolean
}

describe('AnnouncementView 分類欄位與受眾範圍權限', () => {
  beforeEach(() => {
    // mockClear 只清呼叫紀錄，不動 vi.hoisted 設好的預設實作（缺兩碼）；
    // 各測試需要「持有權限」時自行覆寫，維持測試互相獨立。
    hasPermissionMock.mockClear()
    hasPermissionMock.mockImplementation(
      (code: string) => code !== 'ANNOUNCEMENTS_SCHOOL_WRITE' && code !== 'ANNOUNCEMENTS_CLASS_WRITE',
    )
  })

  it('新增公告預設帶入 tenant 的 is_default 分類', async () => {
    const wrapper = shallowMount(AnnouncementView, { global: globalConfig })
    await flushPromises()
    const vm = wrapper.vm as unknown as Vm
    vm.openAdd()
    expect(vm.form.category_id).toBe(2)
  })

  it('缺 ANNOUNCEMENTS_SCHOOL_WRITE／ANNOUNCEMENTS_CLASS_WRITE 時 canScopeSchool/canScopeClass 為 false', async () => {
    const wrapper = shallowMount(AnnouncementView, { global: globalConfig })
    await flushPromises()
    const vm = wrapper.vm as unknown as Vm
    expect(vm.canScopeSchool).toBe(false)
    expect(vm.canScopeClass).toBe(false)
  })

  it('持有兩碼時 canScopeSchool/canScopeClass 皆為 true', async () => {
    hasPermissionMock.mockImplementation(() => true)
    const wrapper = shallowMount(AnnouncementView, { global: globalConfig })
    await flushPromises()
    const vm = wrapper.vm as unknown as Vm
    expect(vm.canScopeSchool).toBe(true)
    expect(vm.canScopeClass).toBe(true)
  })

  // 2026-09-08 補強：上面兩個測試只斷言 computed（canScopeSchool/canScopeClass）
  // 的值，不會發現「computed 邏輯本身正確，但模板 :disabled 綁定被改掉／拔掉」
  // 這種脫鉤——mutation test 實測過：把模板改成 `:disabled="false"` 硬編，
  // 舊測試仍全綠。這裡改斷言實際 render 出來的 <el-radio disabled> 屬性，
  // 直接鎖住「使用者在畫面上真正看到的狀態」，不只是背後的邏輯值。
  it('缺兩碼時，全部家長／指定班級選項在畫面上實際被停用（rendered disabled 屬性）', async () => {
    const wrapper = shallowMount(AnnouncementView, { global: globalConfig })
    await flushPromises()
    ;(wrapper.vm as unknown as Vm).openAdd()
    await flushPromises()

    const allRadio = wrapper.find('el-radio[value="all"]')
    const classroomRadio = wrapper.find('el-radio[value="classroom"]')
    const customRadio = wrapper.find('el-radio[value="custom"]')
    expect(allRadio.exists()).toBe(true)
    expect(classroomRadio.exists()).toBe(true)
    expect(allRadio.attributes('disabled')).toBe('true')
    expect(classroomRadio.attributes('disabled')).toBe('true')
    // 指定學生（custom）不受這兩個獨立碼影響，畫面上不應被停用。
    expect(customRadio.attributes('disabled')).toBeUndefined()
  })

  it('持有兩碼時，全部家長／指定班級選項在畫面上實際可用（rendered disabled 屬性）', async () => {
    hasPermissionMock.mockImplementation(() => true)
    const wrapper = shallowMount(AnnouncementView, { global: globalConfig })
    await flushPromises()
    ;(wrapper.vm as unknown as Vm).openAdd()
    await flushPromises()

    const allRadio = wrapper.find('el-radio[value="all"]')
    const classroomRadio = wrapper.find('el-radio[value="classroom"]')
    expect(allRadio.attributes('disabled')).toBe('false')
    expect(classroomRadio.attributes('disabled')).toBe('false')
  })
})
