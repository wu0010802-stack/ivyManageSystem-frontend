import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ChildContextHeader from '@/parent/components/ChildContextHeader.vue'
import { useChildrenStore } from '@/parent/stores/children'
import { useChildSelection } from '@/parent/composables/useChildSelection'

function seedChildren(items) {
  const store = useChildrenStore()
  store.items = items
  store.loaded = true
}

const stubs = {
  ParentBottomSheet: {
    props: ['modelValue', 'title'],
    emits: ['update:modelValue'],
    template: '<div v-if="modelValue" class="bsheet-stub"><slot /></div>',
  },
  ParentIcon: true,
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  const { setSelected } = useChildSelection()
  setSelected(null)
})

describe('ChildContextHeader', () => {
  it('children 為空：完全不渲染（避免空欄佔位）', () => {
    seedChildren([])
    const wrapper = mount(ChildContextHeader, { global: { stubs } })
    expect(wrapper.find('.child-context-header').exists()).toBe(false)
  })

  it('單孩家庭：渲染為 div 不可 tap，顯示姓名 + 班級', () => {
    seedChildren([{ student_id: 1, name: '小明', classroom_name: '星辰班' }])
    const { setSelected } = useChildSelection()
    setSelected(1)
    const wrapper = mount(ChildContextHeader, { global: { stubs } })
    expect(wrapper.text()).toContain('小明')
    expect(wrapper.text()).toContain('星辰班')
    expect(wrapper.find('button.child-context-header').exists()).toBe(false)
    expect(wrapper.find('div.child-context-header').exists()).toBe(true)
  })

  it('多寶家庭：渲染為 button[aria-haspopup="dialog"]', () => {
    seedChildren([
      { student_id: 1, name: '小明', classroom_name: '星辰班' },
      { student_id: 2, name: '小華', classroom_name: '晨曦班' },
    ])
    const { setSelected } = useChildSelection()
    setSelected(1)
    const wrapper = mount(ChildContextHeader, { global: { stubs } })
    const btn = wrapper.find('button.child-context-header')
    expect(btn.exists()).toBe(true)
    expect(btn.attributes('aria-haspopup')).toBe('dialog')
    expect(btn.attributes('aria-label')).toBe('切換孩子')
  })

  it('多寶 tap → BottomSheet 開啟，列出所有孩子並標記當前選擇', async () => {
    seedChildren([
      { student_id: 1, name: '小明', classroom_name: '星辰班' },
      { student_id: 2, name: '小華', classroom_name: '晨曦班' },
    ])
    const { setSelected } = useChildSelection()
    setSelected(1)
    const wrapper = mount(ChildContextHeader, { global: { stubs } })
    await wrapper.find('button.child-context-header').trigger('click')
    expect(wrapper.find('.bsheet-stub').exists()).toBe(true)
    const items = wrapper.findAll('.bsheet-stub [data-child-option]')
    expect(items.length).toBe(2)
    expect(items[0].attributes('data-active')).toBe('true')
    expect(items[1].attributes('data-active')).toBe('false')
  })

  it('多寶選 BottomSheet item → selectedId 更新 + sheet 關閉', async () => {
    seedChildren([
      { student_id: 1, name: '小明' },
      { student_id: 2, name: '小華' },
    ])
    const { selectedId, setSelected } = useChildSelection()
    setSelected(1)
    const wrapper = mount(ChildContextHeader, { global: { stubs } })
    await wrapper.find('button.child-context-header').trigger('click')
    await wrapper.findAll('.bsheet-stub [data-child-option]')[1].trigger('click')
    await flushPromises()
    expect(selectedId.value).toBe(2)
    expect(wrapper.find('.bsheet-stub').exists()).toBe(false)
  })

  it('variant="hero"：套 hero 樣式（class 含 child-context-header--hero）', () => {
    seedChildren([{ student_id: 1, name: '小明' }])
    const { setSelected } = useChildSelection()
    setSelected(1)
    const wrapper = mount(ChildContextHeader, {
      props: { variant: 'hero' },
      global: { stubs },
    })
    expect(wrapper.find('.child-context-header--hero').exists()).toBe(true)
  })

  it('variant 預設為 page', () => {
    seedChildren([{ student_id: 1, name: '小明' }])
    const { setSelected } = useChildSelection()
    setSelected(1)
    const wrapper = mount(ChildContextHeader, { global: { stubs } })
    expect(wrapper.find('.child-context-header--page').exists()).toBe(true)
  })
})
