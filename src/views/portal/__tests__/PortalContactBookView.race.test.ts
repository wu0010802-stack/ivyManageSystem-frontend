import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/api/portal', () => ({
  getMyStudents: vi.fn(),
}))
vi.mock('@/api/contactBook', () => ({
  applyTemplate: vi.fn(),
  batchPublish: vi.fn(),
  batchUpsert: vi.fn(),
  copyFromYesterday: vi.fn(),
  deletePhoto: vi.fn(),
  getClassDay: vi.fn(),
  publishEntry: vi.fn(),
  updateEntry: vi.fn(),
  uploadPhoto: vi.fn(),
}))
vi.mock('@/composables/useContactBookTemplates', () => ({
  useContactBookTemplates: () => ({
    loaded: { value: false },
    loading: { value: false },
    templates: { value: [] },
    load: vi.fn(),
  }),
}))
vi.mock('@/composables/useErrorNotify', () => ({
  useErrorNotify: () => ({ notify: vi.fn() }),
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

import { getMyStudents } from '@/api/portal'
import { getClassDay } from '@/api/contactBook'
import PortalContactBookView from '../PortalContactBookView.vue'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

interface ClassDayResp {
  data: { items: Array<{ student_id: number; student_name?: string }>; completion?: unknown }
}

function classDay(...ids: number[]): ClassDayResp {
  return {
    data: {
      items: ids.map((id) => ({ student_id: id, student_name: `學生${id}` })),
      completion: { roster: ids.length, draft: 0, published: 0, missing: 0 },
    },
  }
}

async function mountView() {
  vi.mocked(getMyStudents).mockResolvedValue({
    data: { classrooms: [{ classroom_id: 1, classroom_name: '蘋果班' }] },
  } as never)
  // 初次 mount（watch 觸發）的預設回應
  vi.mocked(getClassDay).mockResolvedValue(classDay(99) as never)
  const wrapper = mount(PortalContactBookView, {
    global: {
      stubs: {
        ContactBookFilterBar: true,
        ContactBookEntryCard: true,
        ContactBookEntryDrawer: true,
        EmptyState: true,
        'el-card': true,
        'el-tag': true,
        'el-progress': true,
        'el-empty': true,
        'el-dialog': true,
        'el-button': true,
        'el-radio-group': true,
        'el-radio': true,
      },
      directives: { loading: () => {} },
    },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PortalContactBookView 聯絡簿請求競態', () => {
  it('切班 A(慢)→B(快)：舊班的慢回應不得覆寫最新班級資料', async () => {
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      fetchClassDay: () => Promise<void>
      items: Array<{ student_id: number }>
      listLoading: boolean
    }

    const slow = deferred<ClassDayResp>()
    vi.mocked(getClassDay)
      .mockReturnValueOnce(slow.promise as never) // A 班（慢）
      .mockResolvedValueOnce(classDay(2) as never) // B 班（快）

    const slowRun = vm.fetchClassDay() // A 班發出
    await vm.fetchClassDay() // B 班先回
    expect(vm.items.map((i) => i.student_id)).toEqual([2])

    slow.resolve(classDay(1)) // A 班姍姍來遲
    await slowRun
    // 仍應是 B 班資料，未被 A 班覆寫
    expect(vm.items.map((i) => i.student_id)).toEqual([2])
    // loading 亦不得被落後的 A 班 finally 復位為 true 之外的錯亂
    expect(vm.listLoading).toBe(false)
  })
})
