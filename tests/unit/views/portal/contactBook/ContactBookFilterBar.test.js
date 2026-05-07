import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import ContactBookFilterBar from '@/views/portal/components/contactBook/ContactBookFilterBar.vue'

// Mock Element Plus 元件
const ElSelect = defineComponent({
  name: 'ElSelect',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  setup(_, { slots, emit }) {
    return () =>
      h('select', { onChange: (e) => emit('update:modelValue', e.target.value) }, slots.default?.())
  },
})

const ElOption = defineComponent({
  name: 'ElOption',
  props: ['label', 'value'],
  render() {
    return h('option', { value: this.value }, this.label)
  },
})

const ElDatePicker = defineComponent({
  name: 'ElDatePicker',
  props: ['modelValue', 'clearable', 'valueFormat', 'type'],
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h('input', {
        type: 'date',
        value: props.modelValue,
        onChange: (e) => emit('update:modelValue', e.target.value),
      })
  },
})

const ElButton = defineComponent({
  name: 'ElButton',
  props: ['loading', 'type', 'icon'],
  emits: ['click'],
  setup(_, { slots, emit }) {
    return () => h('button', { onClick: () => emit('click') }, slots.default?.())
  },
})

const ElDivider = defineComponent({
  name: 'ElDivider',
  props: ['direction'],
  render() {
    return h('hr')
  },
})

const ElCheckbox = defineComponent({
  name: 'ElCheckbox',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  setup(props, { slots, emit }) {
    return () =>
      h('label', [
        h('input', {
          type: 'checkbox',
          checked: props.modelValue,
          onChange: (e) => emit('update:modelValue', e.target.checked),
        }),
        slots.default?.(),
      ])
  },
})

const globalConfig = {
  components: { ElSelect, ElOption, ElDatePicker, ElButton, ElDivider, ElCheckbox },
}

const baseProps = {
  classroomId: 1,
  classroomOptions: [
    { value: 1, label: '小白兔' },
    { value: 2, label: '小綠葉' },
  ],
  logDate: '2026-05-06',
  loading: false,
  batchBusy: false,
  showOnlyUnpublished: false,
}

describe('ContactBookFilterBar', () => {
  it('renders select and date picker', () => {
    const w = mount(ContactBookFilterBar, { props: baseProps, global: globalConfig })
    expect(w.findComponent({ name: 'ElSelect' }).exists()).toBe(true)
    expect(w.findComponent({ name: 'ElDatePicker' }).exists()).toBe(true)
  })

  it('renders refresh button', () => {
    const w = mount(ContactBookFilterBar, { props: baseProps, global: globalConfig })
    const buttons = w.findAll('button')
    const refreshBtn = buttons.find((b) => b.text().includes('重新整理'))
    expect(refreshBtn).toBeDefined()
  })

  it('renders batch-bar buttons when classroomId is set', () => {
    const w = mount(ContactBookFilterBar, { props: baseProps, global: globalConfig })
    expect(w.text()).toContain('複製昨日')
    expect(w.text()).toContain('套用範本到全班')
    expect(w.text()).toContain('批次發布草稿')
  })

  it('does not render batch-bar when classroomId is null', () => {
    const w = mount(ContactBookFilterBar, {
      props: { ...baseProps, classroomId: null },
      global: globalConfig,
    })
    expect(w.text()).not.toContain('複製昨日')
    expect(w.text()).not.toContain('批次發布草稿')
  })

  it('emits update:classroomId when select changes', async () => {
    const w = mount(ContactBookFilterBar, { props: baseProps, global: globalConfig })
    await w.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 2)
    expect(w.emitted('update:classroomId')).toBeDefined()
    expect(w.emitted('update:classroomId')[0]).toEqual([2])
  })

  it('emits update:logDate when date picker changes', async () => {
    const w = mount(ContactBookFilterBar, { props: baseProps, global: globalConfig })
    await w.findComponent({ name: 'ElDatePicker' }).vm.$emit('update:modelValue', '2026-05-07')
    expect(w.emitted('update:logDate')).toBeDefined()
    expect(w.emitted('update:logDate')[0]).toEqual(['2026-05-07'])
  })

  it('emits refresh when refresh button is clicked', async () => {
    const w = mount(ContactBookFilterBar, { props: baseProps, global: globalConfig })
    const refreshBtn = w.findAll('button').find((b) => b.text().includes('重新整理'))
    await refreshBtn.trigger('click')
    expect(w.emitted('refresh')).toHaveLength(1)
  })

  it('emits open-copy when 複製昨日 is clicked', async () => {
    const w = mount(ContactBookFilterBar, { props: baseProps, global: globalConfig })
    const btn = w.findAll('button').find((b) => b.text().includes('複製昨日'))
    await btn.trigger('click')
    expect(w.emitted('open-copy')).toHaveLength(1)
  })

  it('emits open-template when 套用範本 is clicked', async () => {
    const w = mount(ContactBookFilterBar, { props: baseProps, global: globalConfig })
    const btn = w.findAll('button').find((b) => b.text().includes('套用範本到全班'))
    await btn.trigger('click')
    expect(w.emitted('open-template')).toHaveLength(1)
  })

  it('emits open-batch when 批次發布 is clicked', async () => {
    const w = mount(ContactBookFilterBar, { props: baseProps, global: globalConfig })
    const btn = w.findAll('button').find((b) => b.text().includes('批次發布草稿'))
    await btn.trigger('click')
    expect(w.emitted('open-batch')).toHaveLength(1)
  })

  it('emits update:showOnlyUnpublished when checkbox changes', async () => {
    const w = mount(ContactBookFilterBar, { props: baseProps, global: globalConfig })
    await w.findComponent({ name: 'ElCheckbox' }).vm.$emit('update:modelValue', true)
    expect(w.emitted('update:showOnlyUnpublished')).toBeDefined()
    expect(w.emitted('update:showOnlyUnpublished')[0]).toEqual([true])
  })
})
