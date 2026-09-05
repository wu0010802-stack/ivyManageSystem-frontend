import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(),
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
import { ElMessageBox } from 'element-plus'
import { onBeforeRouteLeave } from 'vue-router'
import { getClassDay, updateEntry } from '@/api/contactBook'
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


describe('聯絡簿離開與失敗保護', () => {
  it('路由離開必須等待側欄確認', async () => {
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { drawerRef: { requestLeave: () => Promise<boolean> } }
    const requestLeave = vi.fn().mockResolvedValue(false)
    vm.drawerRef = { requestLeave }
    const guard = vi.mocked(onBeforeRouteLeave).mock.calls.at(-1)?.[0]
    expect(guard).toBeDefined()
    expect(await (guard as () => Promise<boolean>)()).toBe(false)
    expect(requestLeave).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('409 保留編輯中的 entry 物件並回傳儲存失敗', async () => {
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      openDrawer: (item: unknown) => void
      drawerEntry: { id: number; version: number; teacher_note: string }
      handleSaveDraft: (payload: Record<string, unknown>, version: number) => Promise<boolean>
    }
    vm.openDrawer({ student_id: 99, entry: { id: 10, version: 1, teacher_note: '原提醒' } })
    const original = vm.drawerEntry
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce('confirm')
    vi.mocked(updateEntry).mockRejectedValueOnce({ response: { status: 409, data: { detail: {
      current_entry: { id: 10, version: 2, teacher_note: '其他人修改' },
    } } } })
    expect(await vm.handleSaveDraft({ teacher_note: '未儲存提醒' }, 1)).toBe(false)
    expect(vm.drawerEntry).toBe(original)
    expect(vm.drawerEntry.teacher_note).toBe('原提醒')
    expect(vm.drawerEntry.version).toBe(2)
    wrapper.unmount()
  })

  it('409 取消覆寫確認時保留原版號與輸入', async () => {
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      openDrawer: (item: unknown) => void
      drawerEntry: { version: number; teacher_note: string }
      handleSaveDraft: (payload: Record<string, unknown>, version: number) => Promise<boolean>
    }
    vm.openDrawer({ student_id: 99, entry: { id: 10, version: 1, teacher_note: '原提醒' } })
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce('cancel')
    vi.mocked(updateEntry).mockRejectedValueOnce({ response: { status: 409, data: { detail: {
      current_entry: { id: 10, version: 2, teacher_note: '其他人修改' },
    } } } })
    expect(await vm.handleSaveDraft({ teacher_note: '未儲存提醒' }, 1)).toBe(false)
    expect(vm.drawerEntry.version).toBe(1)
    expect(vm.drawerEntry.teacher_note).toBe('原提醒')
    wrapper.unmount()
  })

  it('發布確認期間也鎖住側欄，取消後解除', async () => {
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      openDrawer: (item: unknown) => void
      drawerPublishing: boolean
      handlePublish: (payload: Record<string, unknown>, version: number) => Promise<void>
    }
    vm.openDrawer({ student_id: 99, entry: { id: 10, version: 1 } })
    let cancel!: (reason: string) => void
    vi.mocked(ElMessageBox.confirm).mockReturnValueOnce(new Promise((_resolve, reject) => { cancel = reject }) as never)
    const pending = vm.handlePublish({}, 1)
    expect(vm.drawerPublishing).toBe(true)
    cancel('cancel')
    await pending
    expect(vm.drawerPublishing).toBe(false)
    wrapper.unmount()
  })
})
