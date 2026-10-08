import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TimelineItem from '@/parent/components/TimelineItem.vue'

const stubs = { KawaiiStar: true }

function makeItem(over: Record<string, unknown> = {}) {
  return {
    id: 'observation-1',
    type: 'observation',
    icon: '📝',
    title: '觀察記錄（身體動作與健康）',
    summary: 'good',
    occurred_at: '2026-09-02',
    is_highlight: false,
    ...over,
  }
}

describe('TimelineItem — 依 type 對 Material 圖示（不再印後端 emoji）', () => {
  it('observation → edit_note，sky 色調', () => {
    const w = mount(TimelineItem, { props: { item: makeItem() }, global: { stubs } })
    expect(w.find('.tdot').text()).toBe('edit_note')
    expect(w.find('.tdot').classes()).toContain('tone-sky')
  })

  it('measurement → straighten，grape 色調', () => {
    const w = mount(TimelineItem, { props: { item: makeItem({ type: 'measurement', icon: '📏' }) }, global: { stubs } })
    expect(w.find('.tdot').text()).toBe('straighten')
    expect(w.find('.tdot').classes()).toContain('tone-grape')
  })

  it('contact_book → auto_stories，leaf 色調（與首頁聯絡簿按鈕同一張臉）', () => {
    const w = mount(TimelineItem, { props: { item: makeItem({ type: 'contact_book', icon: '📒' }) }, global: { stubs } })
    expect(w.find('.tdot').text()).toBe('auto_stories')
    expect(w.find('.tdot').classes()).toContain('tone-leaf')
  })

  it('incident → warning，coral 色調', () => {
    const w = mount(TimelineItem, { props: { item: makeItem({ type: 'incident', icon: '⚠️' }) }, global: { stubs } })
    expect(w.find('.tdot').text()).toBe('warning')
    expect(w.find('.tdot').classes()).toContain('tone-coral')
  })

  it('未知 type fallback → circle，muted 色調', () => {
    const w = mount(TimelineItem, { props: { item: makeItem({ type: 'something_new', icon: '🧪' }) }, global: { stubs } })
    expect(w.find('.tdot').text()).toBe('circle')
    expect(w.find('.tdot').classes()).toContain('tone-muted')
  })

  it('後端送來的 emoji 不會出現在畫面上', () => {
    const w = mount(TimelineItem, { props: { item: makeItem() }, global: { stubs } })
    expect(w.text()).not.toContain('📝')
  })

  it('標題、摘要、日期照常顯示', () => {
    const w = mount(TimelineItem, { props: { item: makeItem() }, global: { stubs } })
    expect(w.find('.title').text()).toBe('觀察記錄（身體動作與健康）')
    expect(w.find('.summary').text()).toBe('good')
    expect(w.find('.date').text()).toBe('2026-09-02')
  })

  it('is_highlight 顯示星星徽章', () => {
    const w = mount(TimelineItem, { props: { item: makeItem({ is_highlight: true }) }, global: { stubs } })
    expect(w.find('kawaii-star-stub').exists()).toBe(true)
  })
})
