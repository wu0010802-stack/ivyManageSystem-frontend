import { describe, it, expect, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { createRouter, createMemoryHistory, RouterView, useRoute } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia, setActivePinia } from 'pinia'
import { useStudentStore } from '@/stores/student'
import FormDialog from '@/components/common/FormDialog.vue'
import { ElMessageBox } from 'element-plus'
import StudentEditDialog from '@/components/student/StudentEditDialog.vue'

// 家長／緊急聯絡人區段受 GUARDIANS_WRITE 權限遮罩控制（193a966a）；本檔驗證的是
// 收合區段與驗證徽章行為，需要這些區段渲染出來。保留其他匯出，避免影響 store。
vi.mock('@/utils/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/auth')>()),
  hasPermission: vi.fn(() => true),
}))

// el-dialog teleports content to body; stub it to render inline so we can query the form.
const ElDialogStub = {
  name: 'ElDialog',
  template: '<div class="el-dialog-stub"><slot /><slot name="footer" /></div>',
}
const STUBS = {
  'el-dialog': ElDialogStub,
  'el-date-picker': true,
  'el-select': true,
  'el-option': true,
  'el-radio-group': true,
  'el-radio': true,
  'el-switch': true,
} as const

function mountDialog(props: Record<string, unknown> = {}) {
  setActivePinia(createPinia())
  return mount(StudentEditDialog, {
    global: { plugins: [ElementPlus], stubs: STUBS },
    props: { visible: true, mode: 'create', ...props },
  })
}

function isBodyHidden(wrapper: ReturnType<typeof mountDialog>, dataTest: string): boolean {
  const body = wrapper.find(`[data-test="${dataTest}"] .form-section__body`)
  return (body.element as HTMLElement).style.display === 'none'
}

describe('StudentEditDialog', () => {
  it('學生編號呈現唯讀自動配號提示、非輸入框', () => {
    const wrapper = mountDialog()
    const auto = wrapper.find('[data-test="student-id-auto"]')
    expect(auto.exists()).toBe(true)
    expect(auto.text()).toContain('自動配號')
  })

  it('收合區段預設收合（家長/政府申報不可見）', () => {
    const wrapper = mountDialog()
    expect(isBodyHidden(wrapper, 'section-parent')).toBe(true)
    expect(isBodyHidden(wrapper, 'section-gov')).toBe(true)
  })

  it('applyValidationErrors 展開含錯區段（電話錯→家長區展開 + 徽章）', async () => {
    const wrapper = mountDialog()
    ;(wrapper.vm as unknown as { applyValidationErrors: (p: string[]) => void }).applyValidationErrors(['parent_phone'])
    await wrapper.vm.$nextTick()
    expect(isBodyHidden(wrapper, 'section-parent')).toBe(false)
    const badge = wrapper.find('[data-test="section-parent"] .form-section__badge')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('1')
  })
})

it('開啟預填資料不誤判 dirty，修改後取消可選擇繼續編輯或捨棄', async () => {
  const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValueOnce('cancel').mockResolvedValueOnce('confirm')
  const w = mountDialog({ mode: 'edit', initial: { id: 88, name: '測試學生', student_id: 'TEST-88' } })
  const shell = w.findComponent(FormDialog)
  expect(shell.exists()).toBe(true)
  expect(shell.props('dirty')).toBe(false)
  expect(shell.props('submitText')).toBe('儲存變更')
  await w.find('input').setValue('更新測試')
  expect(shell.props('dirty')).toBe(true)
  await shell.find('[data-test="form-dialog-cancel"]').trigger('click')
  await flushPromises()
  expect(w.emitted('update:visible')).toBeUndefined()
  expect((w.find('input').element as HTMLInputElement).value).toBe('更新測試')
  await shell.find('[data-test="form-dialog-cancel"]').trigger('click')
  await flushPromises()
  expect(w.emitted('update:visible')?.at(-1)).toEqual([false])
  confirm.mockRestore()
  w.unmount()
})

it('儲存期間不重複提交，成功後關閉且不出現捨棄提示', async () => {
  const w = mountDialog()
  let resolve!: () => void
  const pending = new Promise<void>(done => { resolve = done })
  const create = vi.spyOn(useStudentStore(), 'createStudent').mockImplementation(() => pending as never)
  const confirm = vi.spyOn(ElMessageBox, 'confirm')
  await w.find('input').setValue('建立測試')
  const shell = w.getComponent(FormDialog)
  expect(shell.props('submitText')).toBe('建立學生')
  await shell.find('[data-test="form-dialog-submit"]').trigger('click')
  await flushPromises()
  expect(create).toHaveBeenCalledTimes(1)
  expect(shell.props('loading')).toBe(true)
  await shell.find('[data-test="form-dialog-submit"]').trigger('click')
  await (shell.vm as unknown as { requestClose: () => Promise<void> }).requestClose()
  expect(w.emitted('update:visible')).toBeUndefined()
  expect(create).toHaveBeenCalledTimes(1)
  resolve()
  await flushPromises()
  expect(w.emitted('saved')).toHaveLength(1)
  expect(w.emitted('update:visible')?.at(-1)).toEqual([false])
  expect(shell.props('dirty')).toBe(false)
  expect(confirm).not.toHaveBeenCalled()
  create.mockRestore()
  confirm.mockRestore()
  w.unmount()
})

async function mountRoutedDialog() {
  setActivePinia(createPinia())
  const router = createRouter({ history: createMemoryHistory(), routes: [{
    path: '/students/profile/:id',
    component: defineComponent({ setup() {
      const route = useRoute()
      return () => h(StudentEditDialog, {
        key: String(route.params.id), visible: true, mode: 'edit',
        initial: { id: Number(route.params.id), name: '路由測試學生' },
      })
    } }),
  }] })
  await router.push('/students/profile/88')
  await router.isReady()
  const wrapper = mount(RouterView, { global: { plugins: [router, ElementPlus], stubs: STUBS } })
  await flushPromises()
  return { wrapper, router }
}

it('同一路由切換學生編號，未儲存資料可保留或確認捨棄', async () => {
  const { wrapper, router } = await mountRoutedDialog()
  const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValueOnce('cancel').mockResolvedValueOnce('confirm')
  await wrapper.find('input').setValue('尚未儲存的修改')
  await router.push('/students/profile/99')
  expect(router.currentRoute.value.params.id).toBe('88')
  expect((wrapper.find('input').element as HTMLInputElement).value).toBe('尚未儲存的修改')
  await router.push('/students/profile/99')
  await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('99')
  expect(confirm).toHaveBeenCalledTimes(2)
  confirm.mockRestore()
  wrapper.unmount()
})

it('同一路由切換學生編號，儲存中不能銷毀正在送出的表單', async () => {
  const { wrapper, router } = await mountRoutedDialog()
  let resolve!: () => void
  const pending = new Promise<void>(done => { resolve = done })
  const update = vi.spyOn(useStudentStore(), 'updateStudent').mockImplementation(() => pending as never)
  const confirm = vi.spyOn(ElMessageBox, 'confirm')
  await wrapper.find('input').setValue('儲存中的修改')
  await wrapper.getComponent(FormDialog).find('[data-test="form-dialog-submit"]').trigger('click')
  await flushPromises()
  expect(update).toHaveBeenCalledTimes(1)
  await router.push('/students/profile/99')
  expect(router.currentRoute.value.params.id).toBe('88')
  expect(confirm).not.toHaveBeenCalled()
  resolve()
  await flushPromises()
  await router.push('/students/profile/99')
  expect(router.currentRoute.value.params.id).toBe('99')
  update.mockRestore()
  confirm.mockRestore()
  wrapper.unmount()
})
