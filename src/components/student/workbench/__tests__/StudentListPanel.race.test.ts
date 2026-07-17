import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { routeMock, replaceMock, pushMock } = vi.hoisted(() => ({
  routeMock: { query: {} as Record<string, string> },
  replaceMock: vi.fn(),
  pushMock: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
}))
vi.mock('@/api/students', () => ({
  getStudents: vi.fn(),
}))
vi.mock('@/api/classrooms', () => ({
  getClassrooms: vi.fn(),
}))
vi.mock('@/api/dismissalCalls', () => ({
  getDismissalCalls: vi.fn(),
  createDismissalCall: vi.fn(),
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))
vi.mock('@element-plus/icons-vue', () => ({
  Search: {}, Plus: {}, Edit: {}, Warning: {}, ArrowDown: {},
}))
vi.mock('@/composables', () => ({
  useConfirmDelete: () => ({ confirmDelete: vi.fn() }),
}))
vi.mock('@/stores/student', () => ({
  useStudentStore: () => ({
    bulkGraduate: vi.fn(),
    graduateStudent: vi.fn(),
    bulkTransfer: vi.fn(),
  }),
}))

import { getStudents } from '@/api/students'
import { getClassrooms } from '@/api/classrooms'
import { getDismissalCalls } from '@/api/dismissalCalls'
import StudentListPanel from '../StudentListPanel.vue'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

async function mountPanel() {
  vi.mocked(getClassrooms).mockResolvedValue({ data: [] } as never)
  vi.mocked(getDismissalCalls).mockResolvedValue({ data: [] } as never)
  vi.mocked(getStudents).mockResolvedValue({ data: { items: [], total: 0 } } as never)
  // shallow：把所有子元件（含未註冊的 el-* 與 SFC 子元件）stub 掉，
  // 避免 el-table 未解析時以 undefined scope 渲染 scoped slot 而爆錯；本測試只驗 script 競態邏輯。
  const wrapper = mount(StudentListPanel, {
    shallow: true,
    global: {
      // el-table 未註冊時會以 undefined scope 渲染 column 的 scoped slot 而爆錯，明確 stub 掉。
      stubs: { 'el-table': true },
      directives: { loading: () => {} },
    },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  routeMock.query = {}
})

describe('StudentListPanel 學生清單請求競態', () => {
  it('切班級 A(慢)→B(快)：晚到的 A 回應不得覆寫最新 B 的名單與總數', async () => {
    const wrapper = await mountPanel()
    const vm = wrapper.vm as unknown as {
      fetchStudents: () => Promise<void>
      students: Array<{ id: number }>
      totalStudents: number
    }

    // 班級 A：慢回應（deferred，稍後才 resolve）
    const slowA = deferred<{ data: { items: Array<{ id: number }>; total: number } }>()
    // 班級 B：快回應（立即 resolve）
    vi.mocked(getStudents)
      .mockReturnValueOnce(slowA.promise as never)
      .mockResolvedValueOnce({ data: { items: [{ id: 20 }, { id: 21 }], total: 7 } } as never)

    const slowRun = vm.fetchStudents() // A（慢）
    await vm.fetchStudents()           // B（快）先返回

    expect(vm.students.map((s) => s.id)).toEqual([20, 21])
    expect(vm.totalStudents).toBe(7)

    // A 的慢回應最後才回來，不得覆寫 B 的結果
    slowA.resolve({ data: { items: [{ id: 1 }, { id: 2 }, { id: 3 }], total: 99 } })
    await slowRun
    await flushPromises()

    expect(vm.students.map((s) => s.id)).toEqual([20, 21])
    expect(vm.totalStudents).toBe(7)
  })

  it('無競態時仍正常寫入最新回應', async () => {
    const wrapper = await mountPanel()
    const vm = wrapper.vm as unknown as {
      fetchStudents: () => Promise<void>
      students: Array<{ id: number }>
      totalStudents: number
    }
    vi.mocked(getStudents).mockResolvedValueOnce({
      data: { items: [{ id: 5 }], total: 1 },
    } as never)
    await vm.fetchStudents()
    await flushPromises()
    expect(vm.students.map((s) => s.id)).toEqual([5])
    expect(vm.totalStudents).toBe(1)
  })
})
