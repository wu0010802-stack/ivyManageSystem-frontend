import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DismissalPosClassroomRail from '../DismissalPosClassroomRail.vue'

const CLASSROOMS = [
  { id: 1, name: '陽光班', count: 3 },
  { id: 2, name: '星星班', count: 0 },
  { id: 3, name: '月亮班' }, // 無 count：不顯示徽章
]

describe('DismissalPosClassroomRail', () => {
  it('渲染每個班級名稱與徽章人數', () => {
    const w = mount(DismissalPosClassroomRail, {
      props: { classrooms: CLASSROOMS, selectedId: 1 },
    })
    const items = w.findAll('.pos-classroom-rail__item')
    expect(items).toHaveLength(3)
    expect(items[0].text()).toContain('陽光班')
    expect(items[0].text()).toContain('3')
    expect(items[1].find('.pos-classroom-rail__badge').classes()).toContain('is-zero')
    expect(items[2].find('.pos-classroom-rail__badge').exists()).toBe(false)
  })

  it('selectedId 對應的班級有選中態樣式與 aria-pressed', () => {
    const w = mount(DismissalPosClassroomRail, {
      props: { classrooms: CLASSROOMS, selectedId: 2 },
    })
    const items = w.findAll('.pos-classroom-rail__item')
    expect(items[1].classes()).toContain('is-active')
    expect(items[1].attributes('aria-pressed')).toBe('true')
    expect(items[0].classes()).not.toContain('is-active')
    expect(items[0].attributes('aria-pressed')).toBe('false')
  })

  it('selectedId 為 null 時沒有任何一項是選中態（不硬性預選）', () => {
    const w = mount(DismissalPosClassroomRail, {
      props: { classrooms: CLASSROOMS, selectedId: null },
    })
    expect(w.find('.is-active').exists()).toBe(false)
  })

  it('點選班級 emit update:selectedId 帶正確的 id', async () => {
    const w = mount(DismissalPosClassroomRail, {
      props: { classrooms: CLASSROOMS, selectedId: 1 },
    })
    await w.findAll('.pos-classroom-rail__item')[2].trigger('click')
    expect(w.emitted('update:selectedId')).toEqual([[3]])
  })
})
