import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, provide, inject, computed, type InjectionKey } from 'vue'

// ── API mocks（先 mock 再 import 元件）────────────────────
vi.mock('@/api/appraisal', () => ({
  listAppraisalCatalog: vi.fn(),
  patchAppraisalCatalogItem: vi.fn(),
}))

const mockHasPermission = vi.fn()
vi.mock('@/utils/auth', () => ({
  hasPermission: (name: string) => mockHasPermission(name),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn().mockResolvedValue(true) },
}))

import { listAppraisalCatalog, patchAppraisalCatalogItem } from '@/api/appraisal'
import { ElMessageBox } from 'element-plus'
import PenaltyCatalogPanel from '../components/PenaltyCatalogPanel.vue'

// ── Element Plus stubs（沿用 ManualEventEntrySection.spec.js 的 el-table 展平慣例）──

function flattenSlotVnodes(vnodes: unknown[]): { type: unknown; props: Record<string, unknown>; children: unknown }[] {
  const out: { type: unknown; props: Record<string, unknown>; children: unknown }[] = []
  for (const v of (vnodes || []) as { type: unknown; children: unknown; props?: Record<string, unknown> }[]) {
    if (v && typeof v.type === 'symbol' && Array.isArray(v.children)) {
      out.push(...flattenSlotVnodes(v.children as unknown[]))
    } else if (v && v.type) {
      out.push({ type: v.type, props: v.props || {}, children: v.children })
    }
  }
  return out
}

const ElTableStub = defineComponent({
  name: 'ElTableStub',
  props: { data: { type: Array, default: () => [] } },
  inheritAttrs: false,
  setup(props, { slots, attrs }) {
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
    )
    return () => {
      const flat = flattenSlotVnodes((slots.default?.() || []) as unknown[])
      return h(
        'div',
        { class: 'el-table', ...dataAttrs },
        flat.map((vnode, index) =>
          h(vnode.type as never, { ...vnode.props, data: props.data, key: index }, vnode.children as never),
        ),
      )
    }
  },
})

const ElTableColumnStub = defineComponent({
  name: 'ElTableColumnStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        { class: 'el-table-column' },
        props.data.map((row, index) =>
          h('div', { key: index, class: 'el-table-row' }, slots.default ? slots.default({ row, $index: index }) : []),
        ),
      )
  },
})

const ElInputStub = defineComponent({
  name: 'ElInputStub',
  props: ['modelValue', 'maxlength', 'type', 'rows'],
  emits: ['update:modelValue'],
  inheritAttrs: false,
  setup(props, { attrs, emit }) {
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
    )
    return () => {
      const tag = props.type === 'textarea' ? 'textarea' : 'input'
      return h(tag, {
        ...dataAttrs,
        maxlength: props.maxlength,
        value: props.modelValue ?? '',
        onInput: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).value),
      })
    }
  },
})

const ElInputNumberStub = defineComponent({
  name: 'ElInputNumberStub',
  props: ['modelValue', 'min', 'max', 'step'],
  emits: ['update:modelValue'],
  inheritAttrs: false,
  setup(props, { attrs, emit }) {
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
    )
    return () =>
      h('input', {
        ...dataAttrs,
        type: 'number',
        min: props.min,
        max: props.max,
        step: props.step,
        value: props.modelValue ?? 0,
        onInput: (e: Event) => emit('update:modelValue', Number((e.target as HTMLInputElement).value)),
      })
  },
})

const ElSwitchStub = defineComponent({
  name: 'ElSwitchStub',
  props: ['modelValue'],
  emits: ['change', 'update:modelValue'],
  inheritAttrs: false,
  setup(props, { attrs, emit }) {
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
    )
    return () =>
      h('button', {
        ...dataAttrs,
        'data-checked': String(!!props.modelValue),
        onClick: () => {
          const next = !props.modelValue
          emit('update:modelValue', next)
          emit('change', next)
        },
      })
  },
})

const ElTagStub = defineComponent({
  name: 'ElTagStub',
  props: ['type'],
  inheritAttrs: false,
  setup(props, { attrs, slots }) {
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
    )
    return () => h('span', { ...dataAttrs, 'data-tag-type': props.type }, slots.default?.())
  },
})

const ElButtonStub = defineComponent({
  name: 'ElButtonStub',
  props: ['loading', 'disabled'],
  emits: ['click'],
  inheritAttrs: false,
  setup(props, { attrs, emit, slots }) {
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
    )
    return () =>
      h(
        'button',
        {
          ...dataAttrs,
          ...(props.disabled || props.loading ? { disabled: 'disabled' } : {}),
          onClick: () => emit('click'),
        },
        slots.default?.(),
      )
  },
})

// el-radio-group / el-radio-button 用 provide/inject 模擬真正元件間的 model 傳遞，
// 避免依賴不可靠的 DOM change 事件冒泡。
const RADIO_GROUP_KEY = Symbol('radio-group-stub') as InjectionKey<{
  modelValue: ReturnType<typeof computed<string>>
  select: (val: string) => void
}>

const ElRadioGroupStub = defineComponent({
  name: 'ElRadioGroupStub',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  inheritAttrs: false,
  setup(props, { attrs, emit, slots }) {
    provide(RADIO_GROUP_KEY, {
      modelValue: computed(() => props.modelValue as string),
      select: (val: string) => emit('update:modelValue', val),
    })
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
    )
    return () => h('div', dataAttrs, slots.default?.())
  },
})

const ElRadioButtonStub = defineComponent({
  name: 'ElRadioButtonStub',
  props: ['value'],
  inheritAttrs: false,
  setup(props, { attrs, slots }) {
    const group = inject(RADIO_GROUP_KEY, null)
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
    )
    return () =>
      h(
        'button',
        {
          ...dataAttrs,
          onClick: () => group?.select(props.value as string),
        },
        slots.default?.(),
      )
  },
})

const GLOBAL_STUBS = {
  'el-table': ElTableStub,
  'el-table-column': ElTableColumnStub,
  'el-input': ElInputStub,
  'el-input-number': ElInputNumberStub,
  'el-switch': ElSwitchStub,
  'el-tag': ElTagStub,
  'el-button': ElButtonStub,
  'el-radio-group': ElRadioGroupStub,
  'el-radio-button': ElRadioButtonStub,
  'el-icon': { template: '<span />' },
}

const directives = { loading: () => {} }

function makeCatalog() {
  return [
    {
      id: 1,
      code: 'LATE_EARLY',
      label: '遲到早退',
      sign: 'NEGATIVE',
      default_weight: '-0.50',
      data_source: 'attendance',
      description: '依打卡紀錄計算',
      display_order: 1,
      is_active: true,
    },
    {
      id: 2,
      code: 'CLASS_HEADCOUNT_BONUS',
      label: '帶班人數獎勵',
      sign: 'POSITIVE',
      default_weight: '2.00',
      data_source: null,
      description: null,
      display_order: 2,
      is_active: false,
    },
    {
      id: 3,
      code: 'REWARD_PUNISH',
      label: '獎懲',
      sign: 'NEUTRAL',
      default_weight: '0.00',
      data_source: null,
      description: '依考核紀錄',
      display_order: 0,
      is_active: true,
    },
  ]
}

async function mountPanel({ catalog = makeCatalog(), canEdit = true } = {}) {
  mockHasPermission.mockReturnValue(canEdit)
  vi.mocked(listAppraisalCatalog).mockResolvedValue({ data: catalog } as never)
  const wrapper = mount(PenaltyCatalogPanel, {
    global: {
      stubs: GLOBAL_STUBS,
      directives,
    },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PenaltyCatalogPanel', () => {
  it('載入後依 display_order 排序渲染欄位（code/性質 tag/預設權重/順序）', async () => {
    const wrapper = await mountPanel()

    // 排序：REWARD_PUNISH(0) → LATE_EARLY(1) → CLASS_HEADCOUNT_BONUS(2)
    const codeCells = wrapper.findAll('[data-test^="code-"]')
    expect(codeCells.map((c) => c.text())).toEqual([
      'REWARD_PUNISH',
      'LATE_EARLY',
      'CLASS_HEADCOUNT_BONUS',
    ])

    expect(wrapper.find('[data-test="sign-tag-REWARD_PUNISH"]').text()).toContain('中性')
    expect(wrapper.find('[data-test="sign-tag-LATE_EARLY"]').text()).toContain('扣分')
    expect(wrapper.find('[data-test="sign-tag-CLASS_HEADCOUNT_BONUS"]').text()).toContain('加分')

    expect(wrapper.find('[data-test="weight-input-LATE_EARLY"]').attributes('value')).toBe('-0.5')
    expect(wrapper.find('[data-test="order-input-LATE_EARLY"]').attributes('value')).toBe('1')
  })

  it('label input 有 maxlength=60；default_weight input-number 有 min/max/step；display_order min=0', async () => {
    const wrapper = await mountPanel()

    const labelInput = wrapper.find('[data-test="label-input-LATE_EARLY"]')
    expect(labelInput.attributes('maxlength')).toBe('60')

    const weightInput = wrapper.find('[data-test="weight-input-LATE_EARLY"]')
    expect(weightInput.attributes('min')).toBe('-99')
    expect(weightInput.attributes('max')).toBe('99')
    expect(weightInput.attributes('step')).toBe('0.1')

    const orderInput = wrapper.find('[data-test="order-input-LATE_EARLY"]')
    expect(orderInput.attributes('min')).toBe('0')
    expect(orderInput.attributes('step')).toBe('1')
  })

  it('is_active 切換先跳確認對話框，確認後才送 PATCH（僅含 is_active 一個異動欄）', async () => {
    vi.mocked(patchAppraisalCatalogItem).mockResolvedValue({
      data: { ...makeCatalog()[0], is_active: false },
    } as never)

    const wrapper = await mountPanel()
    await wrapper.find('[data-test="active-switch-LATE_EARLY"]').trigger('click')
    await flushPromises()

    expect(ElMessageBox.confirm).toHaveBeenCalledTimes(1)
    expect(patchAppraisalCatalogItem).toHaveBeenCalledTimes(1)
    expect(patchAppraisalCatalogItem).toHaveBeenCalledWith(1, { is_active: false })
  })

  it('Task B4：取消確認對話框時不送 PATCH，switch 維持原狀', async () => {
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce('cancel')

    const wrapper = await mountPanel()
    await wrapper.find('[data-test="active-switch-LATE_EARLY"]').trigger('click')
    await flushPromises()

    expect(ElMessageBox.confirm).toHaveBeenCalledTimes(1)
    expect(patchAppraisalCatalogItem).not.toHaveBeenCalled()
    // row.is_active 未變動 → switch stub 的 data-checked 仍反映原始 catalog 值（LATE_EARLY 原為 true）
    expect(wrapper.find('[data-test="active-switch-LATE_EARLY"]').attributes('data-checked')).toBe('true')
  })

  it('Task B4：停用切換的確認訊息包含「停用」字樣；啟用切換包含「啟用」字樣', async () => {
    const wrapper = await mountPanel()

    // LATE_EARLY 目前 is_active=true，點擊即為「停用」流程
    await wrapper.find('[data-test="active-switch-LATE_EARLY"]').trigger('click')
    await flushPromises()
    expect(vi.mocked(ElMessageBox.confirm).mock.calls[0][0]).toContain('停用')

    // CLASS_HEADCOUNT_BONUS 目前 is_active=false，點擊即為「啟用」流程
    vi.mocked(patchAppraisalCatalogItem).mockResolvedValue({
      data: { ...makeCatalog()[1], is_active: true },
    } as never)
    await wrapper.find('[data-test="active-switch-CLASS_HEADCOUNT_BONUS"]').trigger('click')
    await flushPromises()
    expect(vi.mocked(ElMessageBox.confirm).mock.calls[1][0]).toContain('啟用')
  })

  it('無權限時不渲染任何編輯輸入框/switch/儲存按鈕，改顯示純文字與啟用狀態 tag', async () => {
    const wrapper = await mountPanel({ canEdit: false })

    expect(wrapper.find('[data-test="label-input-LATE_EARLY"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="label-text-LATE_EARLY"]').text()).toBe('遲到早退')

    expect(wrapper.find('[data-test="weight-input-LATE_EARLY"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="weight-text-LATE_EARLY"]').exists()).toBe(true)

    expect(wrapper.find('[data-test="active-switch-LATE_EARLY"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="active-text-LATE_EARLY"]').text()).toBe('啟用')
    expect(wrapper.find('[data-test="active-text-CLASS_HEADCOUNT_BONUS"]').text()).toBe('停用')

    expect(wrapper.find('[data-test="save-btn-LATE_EARLY"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="cancel-btn-LATE_EARLY"]').exists()).toBe(false)
  })

  it('編輯 label 後出現儲存按鈕，點擊只送 label 一個異動欄；儲存前 patch 不呼叫', async () => {
    vi.mocked(patchAppraisalCatalogItem).mockResolvedValue({
      data: { ...makeCatalog()[0], label: '遲到早退（新版）' },
    } as never)

    const wrapper = await mountPanel()

    expect(wrapper.find('[data-test="save-btn-LATE_EARLY"]').exists()).toBe(false)

    await wrapper.find('[data-test="label-input-LATE_EARLY"]').setValue('遲到早退（新版）')
    await flushPromises()

    expect(wrapper.find('[data-test="save-btn-LATE_EARLY"]').exists()).toBe(true)
    expect(patchAppraisalCatalogItem).not.toHaveBeenCalled()

    await wrapper.find('[data-test="save-btn-LATE_EARLY"]').trigger('click')
    await flushPromises()

    expect(patchAppraisalCatalogItem).toHaveBeenCalledTimes(1)
    expect(patchAppraisalCatalogItem).toHaveBeenCalledWith(1, { label: '遲到早退（新版）' })
  })

  it('點取消恢復原值並移除儲存/取消按鈕', async () => {
    const wrapper = await mountPanel()

    await wrapper.find('[data-test="label-input-LATE_EARLY"]').setValue('暫存草稿')
    await flushPromises()
    expect(wrapper.find('[data-test="save-btn-LATE_EARLY"]').exists()).toBe(true)

    await wrapper.find('[data-test="cancel-btn-LATE_EARLY"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-test="save-btn-LATE_EARLY"]').exists()).toBe(false)
    const labelInput = wrapper.find('[data-test="label-input-LATE_EARLY"]')
    expect(labelInput.element.value).toBe('遲到早退')
    expect(patchAppraisalCatalogItem).not.toHaveBeenCalled()
  })

  it('篩選「僅啟用」時隱藏停用項目，切回「全部」恢復顯示', async () => {
    const wrapper = await mountPanel()

    // 預設「全部」：停用項目 CLASS_HEADCOUNT_BONUS 仍可見
    expect(wrapper.find('[data-test="code-CLASS_HEADCOUNT_BONUS"]').exists()).toBe(true)

    await wrapper.find('[data-test="filter-active"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-test="code-CLASS_HEADCOUNT_BONUS"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="code-LATE_EARLY"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="code-REWARD_PUNISH"]').exists()).toBe(true)

    await wrapper.find('[data-test="filter-all"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-test="code-CLASS_HEADCOUNT_BONUS"]').exists()).toBe(true)
  })

  it('載入失敗時顯示 apiError 訊息', async () => {
    const { ElMessage } = await import('element-plus')
    vi.mocked(listAppraisalCatalog).mockRejectedValue({
      response: { data: { detail: '目錄載入失敗（測試）' } },
    })
    mockHasPermission.mockReturnValue(true)

    mount(PenaltyCatalogPanel, {
      global: { stubs: GLOBAL_STUBS, directives },
    })
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalledWith('目錄載入失敗（測試）')
  })

  it('PATCH 失敗（含 422 邊界）時顯示後端 detail 訊息', async () => {
    const { ElMessage } = await import('element-plus')
    vi.mocked(patchAppraisalCatalogItem).mockRejectedValue({
      response: { status: 422, data: { detail: 'default_weight 超出範圍' } },
    })

    const wrapper = await mountPanel()
    await wrapper.find('[data-test="label-input-LATE_EARLY"]').setValue('新標籤')
    await flushPromises()
    await wrapper.find('[data-test="save-btn-LATE_EARLY"]').trigger('click')
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalledWith('default_weight 超出範圍')
  })
})
