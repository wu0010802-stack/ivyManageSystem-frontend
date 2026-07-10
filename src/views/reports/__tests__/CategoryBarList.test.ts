import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CategoryBarList from '../CategoryBarList.vue'

const ITEMS = [
  { label: '才藝', amount: 500 },
  { label: '學費', amount: 9000 },
  { label: '雜項收款', amount: 500 },
]

describe('CategoryBarList', () => {
  it('按金額降冪排序，每列含名稱/金額/百分比', () => {
    const w = mount(CategoryBarList, { props: { items: ITEMS } })
    const rows = w.findAll('[data-test="cat-row"]')
    expect(rows).toHaveLength(3)
    expect(rows[0].text()).toContain('學費')
    expect(rows[0].text()).toContain('90.0%')
    expect(rows[1].text()).toContain('5.0%')
  })
  it('金額 0 的類別列出但淡化（.cat-zero）', () => {
    const w = mount(CategoryBarList, { props: { items: [{ label: 'A', amount: 100 }, { label: 'B', amount: 0 }] } })
    const rows = w.findAll('[data-test="cat-row"]')
    expect(rows[1].classes()).toContain('cat-zero')
  })
  it('總額為 0 時所有列不算百分比（顯示 —）', () => {
    const w = mount(CategoryBarList, { props: { items: [{ label: 'A', amount: 0 }] } })
    expect(w.find('[data-test="cat-row"]').text()).toContain('—')
  })
  it('bar 寬度依占比設定', () => {
    const w = mount(CategoryBarList, { props: { items: ITEMS } })
    const fill = w.findAll('[data-test="cat-row"]')[0].find('.cat-bar-fill')
    expect(fill.attributes('style')).toContain('width: 90%')
  })
})
