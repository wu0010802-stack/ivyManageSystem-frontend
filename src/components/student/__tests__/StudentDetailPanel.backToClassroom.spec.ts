/**
 * 「回班級名冊」按鈕的條件渲染與帶狀態返回（2026-08-16 返回入口收斂）。
 *
 * ⚠ 這支守的是**刻意保留的例外，不是漏改**。
 *
 * 2026-08-16 全站把「回上一層」收斂到 AdminHeader 的頂列麵包屑，頁內與其
 * 重複的返回鍵一律移除（員工詳情、分校詳情、薪資月結皆已拿掉）。學生檔案頁
 * 這一顆之所以留著，是因為它做的不是「回上一層」而是**回到來源班級並帶回
 * 選取狀態**（`/classrooms?selected=<id>`）——麵包屑的固定父層（‹ 學生）
 * 表達不了這個動線。
 *
 * 因此日後任何導航清理看到這顆按鈕時，請先看本檔：它應該只在
 * 「page 模式 × 從班級名冊進來 × 有來源班級 id」三者同時成立時出現。
 * 若三條件的任一被放寬或按鈕被整個移除，本檔會紅。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'

// ⚠ 必須用 vi.hoisted 取穩定實例：若寫成 `useRouter: () => ({ replace: vi.fn() })`，
// 每次呼叫都回傳新物件，測試拿不到元件實際用的那個 replace，斷言必定失敗。
const replaceMock = vi.hoisted(() => vi.fn())
const pushMock = vi.hoisted(() => vi.fn())
const getStudentProfileMock = vi.hoisted(() => vi.fn())
const getStudentMock = vi.hoisted(() => vi.fn())

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
}))
vi.mock('@/api/students', () => ({
  getStudentProfile: getStudentProfileMock,
  getStudent: getStudentMock,
}))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))
vi.mock('@/utils/domainBus', () => ({
  domainBus: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
  STUDENT_EVENTS: {},
  RECORD_EVENTS: {},
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

import StudentDetailPanel from '../StudentDetailPanel.vue'

const BACK_BTN = '.back-btn'

async function mountPanel(props: Record<string, unknown>) {
  const wrapper = shallowMount(StudentDetailPanel, {
    props: { studentId: 1, syncUrl: false, ...props },
  })
  await flushPromises()
  return wrapper
}

describe('學生檔案頁「回班級名冊」條件渲染', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getStudentProfileMock.mockResolvedValue({ data: { id: 1, name: '測試學生' } })
    getStudentMock.mockResolvedValue({ data: {} })
  })

  it('page 模式 × 從班級名冊進來 × 有來源班級 → 渲染返回鍵', async () => {
    const wrapper = await mountPanel({
      mode: 'page',
      fromContext: 'classroom',
      fromClassroomId: 7,
    })
    const btn = wrapper.find(BACK_BTN)
    expect(btn.exists(), '從班級名冊進來時應提供帶狀態返回').toBe(true)
    expect(btn.text()).toContain('回班級名冊')
    wrapper.unmount()
  })

  it('點擊後導回班級頁並帶上來源班級 id（帶狀態返回的實質）', async () => {
    const wrapper = await mountPanel({
      mode: 'page',
      fromContext: 'classroom',
      fromClassroomId: 7,
    })
    await wrapper.find(BACK_BTN).trigger('click')

    expect(replaceMock).toHaveBeenCalledTimes(1)
    // query.selected 才是這顆按鈕存在的理由——只斷言「有導回 /classrooms」
    // 會漏掉選取狀態遺失這種退化。
    expect(replaceMock).toHaveBeenCalledWith({
      path: '/classrooms',
      query: { selected: 7 },
    })
    wrapper.unmount()
  })

  it('page 模式但非從班級名冊進來 → 不渲染（一般返回走頂列麵包屑「‹ 學生」）', async () => {
    const wrapper = await mountPanel({ mode: 'page' })
    expect(wrapper.find(BACK_BTN).exists()).toBe(false)
    wrapper.unmount()
  })

  it('drawer 模式即使帶 classroom context 也不渲染（抽屜沒有頁首）', async () => {
    const wrapper = await mountPanel({
      mode: 'drawer',
      fromContext: 'classroom',
      fromClassroomId: 7,
    })
    expect(wrapper.find(BACK_BTN).exists()).toBe(false)
    wrapper.unmount()
  })

  it('缺來源班級 id → 不渲染（沒有目標就沒有帶狀態返回可言）', async () => {
    const wrapper = await mountPanel({
      mode: 'page',
      fromContext: 'classroom',
      fromClassroomId: null,
    })
    expect(wrapper.find(BACK_BTN).exists()).toBe(false)
    wrapper.unmount()
  })
})
