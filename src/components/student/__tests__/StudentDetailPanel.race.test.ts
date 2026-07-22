import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'

// P2（正確性 + 隱私）：fetchProfile 無請求序號守衛。快速切學生 A(慢)→B(快) 時，
// 較舊 A 回應遲到 resolve 會覆寫最新 B 的 profile → 標頭/PII（姓名/電話/健康警示）
// 顯示 A，但名冊高亮的是 B。修正：加 profileSeq，過期回應丟棄不覆寫。

const getStudentProfileMock = vi.hoisted(() => vi.fn())
const getStudentMock = vi.hoisted(() => vi.fn())

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
vi.mock('vue-router', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

import StudentDetailPanel from '../StudentDetailPanel.vue'

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

interface SetupState {
  profile: Record<string, unknown> | null
  editDialogVisible: boolean
  editInitial: Record<string, unknown> | null
  openEditDialog: () => Promise<void>
}

describe('StudentDetailPanel.fetchProfile 請求序號守衛（P2）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getStudentProfileMock.mockReset()
    getStudentMock.mockReset()
    getStudentMock.mockResolvedValue({ data: {} })
  })

  it('切學生 A(慢)→B(快)：較舊 A 回應遲到後不得覆寫最新 B 的 profile', async () => {
    const dA = deferred<{ data: { id: number } }>()
    const dB = deferred<{ data: { id: number } }>()
    getStudentProfileMock.mockReturnValueOnce(dA.promise).mockReturnValueOnce(dB.promise)

    const wrapper = shallowMount(StudentDetailPanel, {
      props: { studentId: 1, mode: 'drawer', syncUrl: false },
    })
    // 首次 mount 觸發 fetchProfile(A)
    await wrapper.setProps({ studentId: 2 }) // 觸發 fetchProfile(B)

    dB.resolve({ data: { id: 2 } })
    await flushPromises()
    const ss = wrapper.vm.$.setupState as SetupState
    expect(ss.profile?.id).toBe(2)

    dA.resolve({ data: { id: 1 } }) // 遲到的舊回應
    await flushPromises()
    expect(ss.profile?.id).toBe(2) // 未被較舊 A 覆寫
    wrapper.unmount()
  })

  it('切學生 A→B 時，遲到的 A 編輯回應不得在 B 畫面開啟', async () => {
    getStudentProfileMock.mockResolvedValue({ data: { id: 1 } })
    const editA = deferred<{ data: { id: number; name: string } }>()
    getStudentMock.mockReturnValueOnce(editA.promise)

    const wrapper = shallowMount(StudentDetailPanel, {
      props: { studentId: 1, mode: 'drawer', syncUrl: false },
    })
    await flushPromises()
    const ss = wrapper.vm.$.setupState as SetupState

    const editPromise = ss.openEditDialog()
    await wrapper.setProps({ studentId: 2 })
    editA.resolve({ data: { id: 1, name: '學生 A' } })
    await editPromise
    await flushPromises()

    expect(ss.editDialogVisible).toBe(false)
    expect(ss.editInitial).toBeNull()
    wrapper.unmount()
  })
})
