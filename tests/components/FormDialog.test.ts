import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import ElementPlus from 'element-plus'
import FormDialog from '@/components/common/FormDialog.vue'

const confirmDiscardChanges = vi.hoisted(() => vi.fn<() => Promise<boolean>>())
vi.mock('@/composables/useUnsavedChangesGuard', () => ({ confirmDiscardChanges }))

// el-dialog 會 teleport 到 body；stub 成就地渲染並保留我們要驗的 props／事件。
const ElDialogStub = defineComponent({
  name: 'ElDialog',
  props: ['modelValue', 'title', 'width', 'fullscreen', 'destroyOnClose', 'closeOnClickModal', 'beforeClose'],
  emits: ['update:modelValue', 'opened', 'closed'],
  setup(props, { slots, emit }) {
    return () => h('div', { class: 'el-dialog-stub', 'data-width': props.width }, [
      h('div', { class: 'stub-header' }, slots.header?.({}) ?? props.title),
      h('div', { class: 'stub-body' }, slots.default?.()),
      h('div', { class: 'stub-footer' }, slots.footer?.()),
      h('button', { class: 'stub-x', onClick: () => props.beforeClose?.(() => emit('update:modelValue', false)) }, 'x'),
    ])
  },
})

function mountDialog(props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
  return mount(FormDialog, {
    attachTo: document.body,
    props: { modelValue: true, title: '新增課程', ...props },
    slots: { default: '<input class="first" /><textarea class="ta"></textarea>', ...slots },
    global: { plugins: [ElementPlus], stubs: { 'el-dialog': ElDialogStub } },
  })
}

describe('FormDialog', () => {
  it('依 size 套 FORM_DIALOG_WIDTH 與 class，預設 compact', () => {
    const w = mountDialog()
    expect(w.find('.el-dialog-stub').attributes('data-width')).toBe('520px')
    expect(w.classes()).toContain('ivy-form-dialog--compact')
    const wide = mountDialog({ size: 'wide' })
    expect(wide.find('.el-dialog-stub').attributes('data-width')).toBe('min(1040px, 94vw)')
  })

  it('footer 預設「取消／儲存」，submitText 可改，主鈕 loading 時 disabled', async () => {
    const w = mountDialog({ submitText: '建立課程', loading: true })
    expect(w.find('[data-test="form-dialog-cancel"]').text()).toBe('取消')
    const submit = w.find('[data-test="form-dialog-submit"]')
    expect(submit.text()).toBe('建立課程')
    expect(submit.attributes('disabled')).toBeDefined()
  })

  it('點主鈕 emit submit；點取消在 clean 時直接關閉並 emit cancel', async () => {
    const w = mountDialog()
    await w.find('[data-test="form-dialog-submit"]').trigger('click')
    expect(w.emitted('submit')).toHaveLength(1)
    await w.find('[data-test="form-dialog-cancel"]').trigger('click')
    await nextTick()
    expect(w.emitted('cancel')).toHaveLength(1)
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
    expect(confirmDiscardChanges).not.toHaveBeenCalled()
  })

  it('dirty 時關閉（X／before-close）先問 confirmDiscardChanges；拒絕則不關', async () => {
    confirmDiscardChanges.mockResolvedValueOnce(false)
    const w = mountDialog({ dirty: true })
    await w.find('.stub-x').trigger('click')
    await nextTick(); await nextTick()
    expect(confirmDiscardChanges).toHaveBeenCalledTimes(1)
    expect(w.emitted('update:modelValue')).toBeUndefined()
    confirmDiscardChanges.mockResolvedValueOnce(true)
    await w.find('.stub-x').trigger('click')
    await nextTick(); await nextTick()
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })

  it('dirty 可為 getter，每次關閉重新求值', async () => {
    let dirty = false
    confirmDiscardChanges.mockResolvedValue(true)
    const w = mountDialog({ dirty: () => dirty })
    await w.find('.stub-x').trigger('click'); await nextTick()
    expect(confirmDiscardChanges).not.toHaveBeenCalled()
    dirty = true
    await w.find('.stub-x').trigger('click'); await nextTick(); await nextTick()
    expect(confirmDiscardChanges).toHaveBeenCalledTimes(1)
  })

  it('Enter：在 input 上 emit submit；在 textarea、isComposing、loading 時不 emit', async () => {
    const w = mountDialog()
    const input = w.find('input.first')
    input.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(w.emitted('submit')).toHaveLength(1)
    input.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true }))
    expect(w.emitted('submit')).toHaveLength(1)
    w.find('textarea.ta').element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(w.emitted('submit')).toHaveLength(1)
    await w.setProps({ loading: true })
    input.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(w.emitted('submit')).toHaveLength(1)
  })

  it('enterSubmit=false 時 Enter 不 emit', () => {
    const w = mountDialog({ enterSubmit: false })
    w.find('input.first').element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(w.emitted('submit')).toBeUndefined()
  })

  it('opened 後聚焦第一個可輸入欄，並轉發 opened 事件', async () => {
    const w = mountDialog()
    w.findComponent(ElDialogStub).vm.$emit('opened')
    await nextTick(); await nextTick()
    expect(document.activeElement).toBe(w.find('input.first').element)
    expect(w.emitted('opened')).toHaveLength(1)
  })

  it('scrollToFirstError 捲到第一個 is-error 欄並聚焦其 input；沒有錯誤回 false', async () => {
    const w = mountDialog({}, {
      default: '<div class="el-form-item"><input class="ok" /></div><div class="el-form-item is-error"><input class="bad" /></div>',
    })
    const bad = w.find('input.bad').element as HTMLInputElement
    const scrolled = vi.fn()
    ;(bad.closest('.el-form-item') as HTMLElement).scrollIntoView = scrolled
    const vm = w.vm as unknown as { scrollToFirstError: () => boolean }
    expect(vm.scrollToFirstError()).toBe(true)
    expect(scrolled).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
    expect(document.activeElement).toBe(bad)
    const clean = mountDialog()
    expect((clean.vm as unknown as { scrollToFirstError: () => boolean }).scrollToFirstError()).toBe(false)
  })

  it('footer-extra 插在主鈕左側；footer slot 整個取代；requiredLegend 為字串時渲染', () => {
    const w = mountDialog({ requiredLegend: '* 為必填' }, { 'footer-extra': '<button class="extra">儲存並新增下一筆</button>' })
    const footer = w.find('.stub-footer')
    expect(footer.find('.extra').exists()).toBe(true)
    expect(footer.html().indexOf('extra')).toBeLessThan(footer.html().indexOf('form-dialog-submit'))
    expect(w.find('.required-legend').text()).toBe('* 為必填')
    const replaced = mountDialog({}, { footer: '<span class="mine">自訂</span>' })
    expect(replaced.find('[data-test="form-dialog-submit"]').exists()).toBe(false)
    expect(replaced.find('.mine').exists()).toBe(true)
  })
})
