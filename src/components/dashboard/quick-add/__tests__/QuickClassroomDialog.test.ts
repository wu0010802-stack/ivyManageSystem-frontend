import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, onErrorCaptured } from 'vue'
import QuickClassroomDialog from '../QuickClassroomDialog.vue'

// 同 QuickStudentDialog 的缺陷類別（2026-07-19 生產環境 bug）：HomeView.vue 無條件掛載
// QuickClassroomDialog，onMounted 無條件呼叫 getGrades() 且漏了 catch，403 時未捕捉的
// rejection 會冒泡到 App 層級 ErrorBoundary 拖垮整頁。
const getGradesMock = vi.hoisted(() => vi.fn())
vi.mock('@/api/classrooms', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, getGrades: getGradesMock }
})

type ExposedVm = { loadGrades: () => Promise<void> }

function mountComp(visible = false) {
  return mount(QuickClassroomDialog, {
    props: { visible },
    global: { stubs: { teleport: true } },
  })
}

function mountWithErrorBoundary(visible = false) {
  const caught: unknown[] = []
  const Host = defineComponent({
    setup() {
      onErrorCaptured((err) => {
        caught.push(err)
        return false
      })
      return () => h(QuickClassroomDialog, { visible, 'onUpdate:visible': () => {} })
    },
  })
  const wrapper = mount(Host, { global: { stubs: { teleport: true } } })
  const child = wrapper.findComponent(QuickClassroomDialog)
  return { child, caught }
}

describe('QuickClassroomDialog', () => {
  beforeEach(() => {
    getGradesMock.mockReset()
    getGradesMock.mockResolvedValue({ data: [] })
  })

  it('掛載時對話框為隱藏狀態，不應打 /grades（首頁背景掛載不該預先發請求）', async () => {
    mountComp(false)
    await flushPromises()
    expect(getGradesMock).not.toHaveBeenCalled()
  })

  it('對話框開啟（loadGrades 被觸發）時才打 /grades', async () => {
    const wrapper = mountComp(false)
    await flushPromises()
    await (wrapper.vm as unknown as ExposedVm).loadGrades()
    await flushPromises()
    expect(getGradesMock).toHaveBeenCalledTimes(1)
  })

  it('/grades 403 時錯誤不得冒泡到上層 ErrorBoundary（否則會拖垮整頁）', async () => {
    getGradesMock.mockRejectedValue(new Error('403 Forbidden'))
    const { child, caught } = mountWithErrorBoundary(false)
    await (child.vm as unknown as ExposedVm).loadGrades()
    await flushPromises()
    expect(caught).toEqual([])
  })
})
