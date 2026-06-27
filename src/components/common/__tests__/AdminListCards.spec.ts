import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import AdminListCards from '@/components/common/AdminListCards.vue'

const items = [
  { id: 'A1', name: '王小明', dept: '行政' },
  { id: 'A2', name: '李小華', dept: '教學' },
]
const columns = [
  { label: '部門', prop: 'dept' },
  { label: '代號', prop: 'id', formatter: (it: Record<string, unknown>) => `#${it.id}` },
]

describe('AdminListCards', () => {
  it('每筆 item 渲染一張卡片，含 columns 的 label 與 value', () => {
    const w = mount(AdminListCards, { props: { items, columns, rowKey: 'id' } })
    const cards = w.findAll('.alc-card')
    expect(cards).toHaveLength(2)
    expect(cards[0].text()).toContain('部門')
    expect(cards[0].text()).toContain('行政')
    // formatter 生效
    expect(cards[0].text()).toContain('#A1')
  })

  it('#title slot 覆寫卡片標題；無 slot 時 fallback 第一欄', () => {
    const w = mount(AdminListCards, {
      props: { items, columns, rowKey: 'id' },
      slots: { title: ({ item }: { item: Record<string, unknown> }) => h('span', { class: 'my-title' }, String(item.name)) },
    })
    expect(w.find('.my-title').text()).toBe('王小明')
  })

  it('#cell-<prop> slot 覆寫該欄 value 渲染', () => {
    const w = mount(AdminListCards, {
      props: { items, columns, rowKey: 'id' },
      slots: { 'cell-dept': ({ item }: { item: Record<string, unknown> }) => h('em', { class: 'dept-tag' }, String(item.dept)) },
    })
    expect(w.find('.dept-tag').exists()).toBe(true)
  })

  it('#actions slot 渲染於每張卡片底部', () => {
    const w = mount(AdminListCards, {
      props: { items, columns, rowKey: 'id' },
      slots: { actions: ({ item }: { item: Record<string, unknown> }) => h('button', { class: 'act' }, String(item.id)) },
    })
    expect(w.findAll('.alc-card__actions .act')).toHaveLength(2)
  })

  it('loading 時不渲染資料卡片（顯示骨架）', () => {
    const w = mount(AdminListCards, { props: { items, columns, rowKey: 'id', loading: true } })
    expect(w.findAll('.alc-card:not(.alc-card--skeleton)')).toHaveLength(0)
    expect(w.find('.alc-card--skeleton').exists()).toBe(true)
  })

  it('items 空時顯示 emptyText', () => {
    const w = mount(AdminListCards, { props: { items: [], columns, rowKey: 'id', emptyText: '尚無資料' } })
    expect(w.find('.alc-empty').text()).toContain('尚無資料')
  })
})
