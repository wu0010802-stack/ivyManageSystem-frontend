/**
 * 首頁班級卡帶的 classroom_id 目標頁根本不讀，多班教師會開到錯的班（bug-hunt 2026-07-27）。
 *
 * ClassroomOpsCard 對每張班級卡都很認真地帶了 `?classroom_id=`（聯絡簿、點名各一），
 * 但 PortalContactBookView 與 PortalStudentAttendanceView 整檔 0 處使用 useRoute /
 * route.query，一律選 classrooms[0]。
 *
 * 同時掛 2 個以上班級的老師（才藝老師、兼任副班）點第二／第三張卡的「聯絡簿」或
 * 「點名」，跳過去看到的是第一班的名單。網址上明明帶著正確的 classroom_id。
 * 更麻煩的是首頁卡片依班名排序、目標頁的班級清單沒有排序，兩邊的「第一筆」不保證
 * 相同，錯得不固定。有誤點名、誤寫聯絡簿的風險。
 *
 * 搜尋面板點某天的聯絡簿所帶的 `?log_date=` 同樣被忽略，日期固定回今天。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

const routeQuery: Record<string, string> = {}

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, query: routeQuery }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

const CLASSROOMS = [
  { classroom_id: 11, classroom_name: '小班', students: [] },
  { classroom_id: 22, classroom_name: '中班', students: [] },
]

vi.mock('@/api/portal', () => ({
  getMyStudents: vi.fn().mockResolvedValue({ data: { classrooms: CLASSROOMS } }),
}))

vi.mock('@/api/contactBook', () => ({
  listContactBook: vi.fn().mockResolvedValue({ data: { items: [] } }),
  getContactBookEntry: vi.fn().mockResolvedValue({ data: {} }),
  upsertContactBookEntry: vi.fn(),
  publishContactBookEntry: vi.fn(),
  deleteContactBookEntry: vi.fn(),
  uploadContactBookPhoto: vi.fn(),
  deleteContactBookPhoto: vi.fn(),
  batchPublishContactBook: vi.fn(),
}))

vi.mock('@/api/studentAttendance', () => ({
  getClassAttendance: vi.fn().mockResolvedValue({ data: { records: [] } }),
  batchSaveClassAttendance: vi.fn(),
  exportClassAttendance: vi.fn(),
  getMonthlyClassAttendance: vi.fn().mockResolvedValue({ data: {} }),
}))

beforeEach(() => {
  for (const k of Object.keys(routeQuery)) delete routeQuery[k]
})

async function mountView(path: string) {
  const mod = await import(path)
  const wrapper = mount(mod.default, { global: { plugins: [ElementPlus] } })
  await flushPromises()
  return wrapper
}

describe('教師端 deep link 的 classroom_id', () => {
  it('聯絡簿：網址指定第二班時要選第二班，不是清單第一筆', async () => {
    routeQuery.classroom_id = '22'
    const wrapper = await mountView('@/views/portal/PortalContactBookView.vue')

    expect(
      (wrapper.vm as unknown as { selectedClassroomId: number }).selectedClassroomId,
    ).toBe(22)
  })

  it('點名：網址指定第二班時要選第二班', async () => {
    routeQuery.classroom_id = '22'
    const wrapper = await mountView('@/views/portal/PortalStudentAttendanceView.vue')

    expect((wrapper.vm as unknown as { classroomId: number }).classroomId).toBe(22)
  })

  it('網址帶了不屬於自己的班級 id 時，退回第一班而不是吃 403', async () => {
    routeQuery.classroom_id = '999'
    const wrapper = await mountView('@/views/portal/PortalContactBookView.vue')

    expect(
      (wrapper.vm as unknown as { selectedClassroomId: number }).selectedClassroomId,
    ).toBe(11)
  })

  it('沒帶 classroom_id 時維持既有行為（第一班）', async () => {
    const wrapper = await mountView('@/views/portal/PortalStudentAttendanceView.vue')

    expect((wrapper.vm as unknown as { classroomId: number }).classroomId).toBe(11)
  })

  it('聯絡簿：網址帶 log_date 時要用該日期，不是固定今天', async () => {
    routeQuery.log_date = '2026-05-09'
    const wrapper = await mountView('@/views/portal/PortalContactBookView.vue')

    expect((wrapper.vm as unknown as { selectedDate: string }).selectedDate).toBe(
      '2026-05-09',
    )
  })
})
