import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, onErrorCaptured } from 'vue'
import ElementPlus from 'element-plus'
import QuickStudentDialog from '../QuickStudentDialog.vue'

// 生產環境 bug 重現（2026-07-19）：HomeView.vue 無條件掛載 QuickStudentDialog（無 v-if
// 包住），任何角色缺 CLASSROOMS_READ 時，onMounted 無條件呼叫 getClassrooms() 會 403，
// 且原本 try/finally 漏了 catch，未捕捉的 rejection 冒泡到 App 層級 ErrorBoundary，
// 導致整個首頁被替換成「此頁載入失敗」（而非只有這個看不見的快速新增對話框壞掉）。
const getClassroomsMock = vi.hoisted(() => vi.fn())
vi.mock('@/api/classrooms', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, getClassrooms: getClassroomsMock }
})

const submitCreateMock = vi.hoisted(() => vi.fn())
vi.mock('@/utils/studentDuplicateConflict', () => ({
  submitStudentCreateWithDuplicateConfirm: submitCreateMock,
}))

import { domainBus, STUDENT_EVENTS } from '@/utils/domainBus'

type ExposedVm = {
  loadClassrooms: () => Promise<void>
  handleSubmit: () => Promise<void>
  form: { name: string; classroom_id: number | null }
}

function mountComp(visible = false) {
  return mount(QuickStudentDialog, {
    props: { visible },
    global: { stubs: { teleport: true } },
  })
}

/** 掛真 Element Plus（需要 el-form 的 validate／clearValidate）。 */
function mountReal(visible = false) {
  return mount(QuickStudentDialog, {
    props: { visible },
    attachTo: document.body,
    global: { plugins: [ElementPlus] },
  })
}

/**
 * 比照生產環境真實結構：QuickStudentDialog 掛在 App 層級 ErrorBoundary（onErrorCaptured）之下。
 */
function mountWithErrorBoundary(visible = false) {
  const caught: unknown[] = []
  const Host = defineComponent({
    setup() {
      onErrorCaptured((err) => {
        caught.push(err)
        return false
      })
      return () => h(QuickStudentDialog, { visible, 'onUpdate:visible': () => {} })
    },
  })
  const wrapper = mount(Host, { global: { stubs: { teleport: true } } })
  const child = wrapper.findComponent(QuickStudentDialog)
  return { child, caught }
}

describe('QuickStudentDialog', () => {
  beforeEach(() => {
    getClassroomsMock.mockReset()
    getClassroomsMock.mockResolvedValue({ data: [] })
  })

  it('掛載時對話框為隱藏狀態，不應打 /classrooms（首頁背景掛載不該預先發請求）', async () => {
    mountComp(false)
    await flushPromises()
    expect(getClassroomsMock).not.toHaveBeenCalled()
  })

  it('對話框開啟（loadClassrooms 被觸發）時才打 /classrooms', async () => {
    const wrapper = mountComp(false)
    await flushPromises()
    await (wrapper.vm as unknown as ExposedVm).loadClassrooms()
    await flushPromises()
    expect(getClassroomsMock).toHaveBeenCalledTimes(1)
  })

  it('/classrooms 403 時錯誤不得冒泡到上層 ErrorBoundary（否則會拖垮整頁，重現生產環境「此頁載入失敗」）', async () => {
    getClassroomsMock.mockRejectedValue(new Error('403 Forbidden'))
    const { child, caught } = mountWithErrorBoundary(false)
    await (child.vm as unknown as ExposedVm).loadClassrooms()
    await flushPromises()
    expect(caught).toEqual([])
  })

  it('性別選項使用中文「男」「女」值、學號欄位已移除（2026-08-01 稽核：M/F 會靜默入庫且學號由後端配發）', async () => {
    const wrapper = mountComp(true)
    await flushPromises()
    const html = wrapper.html()
    expect(html).toContain('value="男"')
    expect(html).toContain('value="女"')
    expect(html).not.toContain('value="M"')
    expect(html).not.toContain('學號')
  })

  // 首頁快速新增學生原本直接打 API、沒通知 domainBus，學生／班級人數等共用快取
  // （syncBridge 依 student:created 失效）要等 5 分鐘 TTL 才更新。
  it('送出成功後 emit student:created（讓學生與班級快取失效）', async () => {
    submitCreateMock.mockResolvedValue({ data: { id: 9, classroom_id: 3 } })
    const handler = vi.fn()
    domainBus.on(STUDENT_EVENTS.CREATED, handler)
    try {
      const wrapper = mountReal(true)
      await flushPromises()
      const vm = wrapper.vm as unknown as ExposedVm
      vm.form.name = '小明'
      vm.form.classroom_id = 3
      await vm.handleSubmit()
      await flushPromises()
      expect(submitCreateMock).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith({ id: 9, classroom_id: 3 })
      wrapper.unmount()
    } finally {
      domainBus.off(STUDENT_EVENTS.CREATED, handler)
    }
  })

  it('送出失敗時不 emit student:created', async () => {
    submitCreateMock.mockRejectedValue(new Error('boom'))
    const handler = vi.fn()
    domainBus.on(STUDENT_EVENTS.CREATED, handler)
    try {
      const wrapper = mountReal(true)
      await flushPromises()
      const vm = wrapper.vm as unknown as ExposedVm
      vm.form.name = '小明'
      await vm.handleSubmit()
      await flushPromises()
      expect(handler).not.toHaveBeenCalled()
      wrapper.unmount()
    } finally {
      domainBus.off(STUDENT_EVENTS.CREATED, handler)
    }
  })

  // 原本班級清單只在第一次開啟時載入、之後永遠沿用；首頁不會重新掛載，
  // 期間新增的班級要整頁重整才選得到。每次開啟都重新載入。
  it('每次開啟對話框都重新載入班級清單', async () => {
    getClassroomsMock.mockResolvedValue({ data: [{ id: 1, name: '甲班' }] })
    const wrapper = mountReal(false)
    await wrapper.setProps({ visible: true })
    await flushPromises()
    await wrapper.setProps({ visible: false })
    await wrapper.setProps({ visible: true })
    await flushPromises()
    expect(getClassroomsMock).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })
})
