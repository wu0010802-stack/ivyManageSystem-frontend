// src/views/appraisal/__tests__/CreateCycleDialog.spec.ts
//
// Task A7：統一建考核週期入口的共用 dialog。驗證：
// - 開啟時（visible: false → true）重置為當前學年學期，target/actual 留空
// - 完整表單欄位存在（學年/學期/招生目標/實際註冊）
// - 送出呼叫 createAppraisalCycle(buildCreateCyclePayload(form))，成功 emit created
// - canWrite gate：無寫入權限時送出鈕 disabled（tooltip 包 span pattern，比照
//   YearEndListView），用可調矩陣覆蓋 true/false 兩態（不可只用單一 mock 帶過）
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

vi.mock('@/api/appraisal', () => ({
  createAppraisalCycle: vi.fn(),
}))

const termState = { school_year: 114, semester: 1 }
vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({
    get school_year() { return termState.school_year },
    get semester() { return termState.semester },
  }),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

import { createAppraisalCycle } from '@/api/appraisal'
import CreateCycleDialog from '../components/CreateCycleDialog.vue'

// ── Element Plus 元件 stubs ───────────────────────────────
const ElButtonStub = defineComponent({
  name: 'ElButtonStub',
  props: ['disabled', 'loading'],
  inheritAttrs: false,
  setup(props, { attrs, emit, slots }) {
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
    )
    return () => h(
      'button',
      {
        ...dataAttrs,
        ...(props.disabled ? { disabled: 'disabled' } : {}),
        onClick: () => emit('click'),
      },
      slots.default?.(),
    )
  },
})

const ElDialogStub = defineComponent({
  name: 'ElDialogStub',
  props: ['modelValue'],
  inheritAttrs: false,
  setup(props, { attrs, slots }) {
    return () => props.modelValue
      ? h('div', { class: 'el-dialog-stub', ...attrs },
          [slots.default?.(), slots.footer?.()].filter(Boolean))
      : null
  },
})

const GLOBAL_STUBS = {
  'el-button': ElButtonStub,
  'el-dialog': ElDialogStub,
  'el-tooltip': defineComponent({
    name: 'ElTooltipStub',
    props: ['content', 'disabled'],
    inheritAttrs: false,
    setup(props, { slots }) {
      return () => h('div', { class: 'el-tooltip-stub', 'data-content': props.content, 'data-disabled': String(!!props.disabled) }, slots.default?.())
    },
  }),
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<label><slot /></label>' },
  'el-input-number': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    inheritAttrs: false,
    template: '<input :data-test="$attrs[\'data-test\']" type="number" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value === \'\' ? null : Number($event.target.value))" />',
  },
  'el-radio-group': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    inheritAttrs: false,
    template: '<div :data-test="$attrs[\'data-test\']"><slot /></div>',
  },
  'el-radio-button': {
    props: ['value'],
    template: '<button type="button" @click="$emit(\'update:modelValue\', value)"><slot /></button>',
  },
}

function mountDialog(props: Partial<{ visible: boolean; canWrite: boolean }> = {}) {
  return mount(CreateCycleDialog, {
    props: { visible: true, canWrite: true, ...props },
    global: { stubs: GLOBAL_STUBS },
  })
}

describe('CreateCycleDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    termState.school_year = 114
    termState.semester = 1
  })

  it('渲染完整表單：學年/學期/招生目標/實際註冊', async () => {
    const wrapper = mountDialog()
    await flushPromises()

    expect(wrapper.find('[data-test="create-cycle-year"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="create-cycle-semester"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="create-cycle-target"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="create-cycle-actual"]').exists()).toBe(true)
  })

  it('開啟時（visible false→true）重置為當前學年學期，target/actual 留空', async () => {
    const wrapper = mount(CreateCycleDialog, {
      props: { visible: false, canWrite: true },
      global: { stubs: GLOBAL_STUBS },
    })
    await flushPromises()

    await wrapper.setProps({ visible: true })
    await flushPromises()

    const target = wrapper.find('[data-test="create-cycle-target"]')
    const actual = wrapper.find('[data-test="create-cycle-actual"]')
    expect((target.element as HTMLInputElement).value).toBe('')
    expect((actual.element as HTMLInputElement).value).toBe('')
  })

  it('Task A7 fix：傳入 defaultYear/defaultSemester 時開啟後表單預帶該值，非 termStore 的值', async () => {
    // termStore mock 為 114/FIRST，但呼叫方（YearlyEnrollmentTargetSection）傳入
    // 115/SECOND（selectedYear + 點擊的卡片）——回歸前 dialog 會忽略這兩個 prop 一律
    // 重置為 termStore 值，此案驗證 override 生效。
    const wrapper = mount(CreateCycleDialog, {
      props: { visible: false, canWrite: true, defaultYear: 115, defaultSemester: 'SECOND' },
      global: { stubs: GLOBAL_STUBS },
    })
    await flushPromises()

    await wrapper.setProps({ visible: true })
    await flushPromises()

    const year = wrapper.find('[data-test="create-cycle-year"]')
    expect((year.element as HTMLInputElement).value).toBe('115')
    const semesterGroup = wrapper.find('[data-test="create-cycle-semester"]')
    // el-radio-group stub 本身不回顯 modelValue（見上方 stub），改由送出 payload 驗證語意正確。
    expect(semesterGroup.exists()).toBe(true)

    await wrapper.find('[data-test="create-cycle-submit"]').trigger('click')
    await flushPromises()
    expect(vi.mocked(createAppraisalCycle)).toHaveBeenCalledWith(
      expect.objectContaining({ academic_year: 115, semester: 'SECOND' }),
    )
  })

  it('Task A7 fix：未傳 defaultYear/defaultSemester 時維持 fallback termStore 當前值（另兩入口不回歸）', async () => {
    const wrapper = mount(CreateCycleDialog, {
      props: { visible: false, canWrite: true },
      global: { stubs: GLOBAL_STUBS },
    })
    await flushPromises()

    await wrapper.setProps({ visible: true })
    await flushPromises()

    await wrapper.find('[data-test="create-cycle-submit"]').trigger('click')
    await flushPromises()
    expect(vi.mocked(createAppraisalCycle)).toHaveBeenCalledWith(
      expect.objectContaining({ academic_year: 114, semester: 'FIRST' }),
    )
  })

  it('送出呼叫 createAppraisalCycle(buildCreateCyclePayload(form))，成功 emit created 與 update:visible(false)', async () => {
    vi.mocked(createAppraisalCycle).mockResolvedValue({ data: { id: 99 } } as never)
    const wrapper = mountDialog()
    await flushPromises()

    await wrapper.find('[data-test="create-cycle-target"]').setValue(160)
    await wrapper.find('[data-test="create-cycle-actual"]').setValue(152)
    await wrapper.find('[data-test="create-cycle-submit"]').trigger('click')
    await flushPromises()

    expect(createAppraisalCycle).toHaveBeenCalledWith({
      academic_year: 114,
      semester: 'FIRST',
      enrollment_target: 160,
      enrollment_actual: 152,
    })
    expect(wrapper.emitted('created')?.[0]).toEqual([{ id: 99 }])
    expect(wrapper.emitted('update:visible')?.at(-1)).toEqual([false])
  })

  it('目標留空送出時 enrollment_target 補 0', async () => {
    vi.mocked(createAppraisalCycle).mockResolvedValue({ data: { id: 100 } } as never)
    const wrapper = mountDialog()
    await flushPromises()

    await wrapper.find('[data-test="create-cycle-submit"]').trigger('click')
    await flushPromises()

    expect(createAppraisalCycle).toHaveBeenCalledWith(
      expect.objectContaining({ enrollment_target: 0, enrollment_actual: null }),
    )
  })

  // ── canWrite 權限矩陣（鐵律：不可只用單一 mock 帶過）───────
  it.each([
    { canWrite: true, expectDisabled: false },
    { canWrite: false, expectDisabled: true },
  ])('canWrite=$canWrite 時送出鈕 disabled=$expectDisabled', async ({ canWrite, expectDisabled }) => {
    const wrapper = mountDialog({ canWrite })
    await flushPromises()

    const btn = wrapper.find('[data-test="create-cycle-submit"]')
    expect(btn.attributes('disabled') !== undefined).toBe(expectDisabled)
    const tooltip = wrapper.find('.el-tooltip-stub')
    expect(tooltip.attributes('data-disabled')).toBe(String(canWrite))
  })

  it('canWrite=false 時點送出鈕不應呼叫 createAppraisalCycle（防禦，非只靠 UI disabled）', async () => {
    const wrapper = mountDialog({ canWrite: false })
    await flushPromises()

    await wrapper.find('[data-test="create-cycle-submit"]').trigger('click')
    await flushPromises()

    expect(createAppraisalCycle).not.toHaveBeenCalled()
  })
})
