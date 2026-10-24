/**
 * RecapRail — 照片牆頂部的回顧卡片列。
 *
 * 守的三件事：
 *  1. 沒有回顧時整個區塊不渲染（空窗後端不回傳，前端也不該留一塊空殼）
 *  2. 卡片數量＝後端給幾個時間窗就幾張，前端不自行過濾
 *  3. 點卡片把整個 recap 物件交給 caller（caller 直接拿去開檢視器）
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RecapRail from '../RecapRail.vue'
import type { PhotoRecap } from '../../../api/childPhotos'

function makePhoto(id: number) {
  return {
    id,
    owner_type: 'class_album',
    owner_id: 1,
    url: `/u${id}.jpg`,
    display_url: `/d${id}.jpg`,
    thumb_url: `/t${id}.jpg`,
    original_filename: `${id}.jpg`,
    photo_date: '2026-08-16',
    created_at: null,
    category: 'life' as const,
  }
}

// key 走契約型別（後端目前宣告為裸 str）；日後後端改 Literal 這裡會自動跟著收緊
function makeRecap(key: PhotoRecap['key'], label: string, count = 3): PhotoRecap {
  return {
    key,
    label,
    anchor_date: '2026-08-16',
    range_start: '2026-08-11',
    range_end: '2026-08-21',
    photo_count: count,
    photos: Array.from({ length: count }, (_, i) => makePhoto(i + 1)),
  }
}

describe('RecapRail', () => {
  it('items 為空 → 整個區塊不渲染', () => {
    const w = mount(RecapRail, { props: { items: [] } })
    expect(w.find('[data-test="recap-rail"]').exists()).toBe(false)
    expect(w.findAll('[data-test="recap-card"]')).toHaveLength(0)
  })

  it('有幾個回顧就渲染幾張卡，順序照後端給的來', () => {
    const items = [
      makeRecap('1m', '1 個月前'),
      makeRecap('6m', '半年前'),
      makeRecap('1y', '1 年前'),
    ]
    const w = mount(RecapRail, { props: { items } })
    expect(w.find('[data-test="recap-rail"]').exists()).toBe(true)
    const cards = w.findAll('[data-test="recap-card"]')
    expect(cards).toHaveLength(3)
    expect(cards.map((c) => c.attributes('data-recap-key'))).toEqual(['1m', '6m', '1y'])
  })

  it('卡片顯示時間文案、日期區間與張數角標', () => {
    const w = mount(RecapRail, { props: { items: [makeRecap('1m', '1 個月前', 8)] } })
    const card = w.find('[data-test="recap-card"]')
    expect(card.text()).toContain('1 個月前')
    // 同年時結束日省略年份
    expect(card.text()).toContain('2026/08/11 – 08/21')
    expect(card.text()).toContain('8 張')
  })

  it('封面取第一張照片的縮圖', () => {
    const w = mount(RecapRail, { props: { items: [makeRecap('1m', '1 個月前')] } })
    expect(w.find('.cover').attributes('src')).toBe('/t1.jpg')
  })

  it('每張卡都有可朗讀的 aria-label（icon-only 視覺、資訊全在圖上）', () => {
    const w = mount(RecapRail, { props: { items: [makeRecap('6m', '半年前', 11)] } })
    const label = w.find('[data-test="recap-card"]').attributes('aria-label')
    expect(label).toContain('半年前')
    expect(label).toContain('11 張')
  })

  it('photos 空的回顧不渲染（點開只會是一片全黑）', () => {
    const broken = { ...makeRecap('1m', '1 個月前', 3), photos: [] }
    const w = mount(RecapRail, { props: { items: [broken, makeRecap('1y', '1 年前')] } })
    const cards = w.findAll('[data-test="recap-card"]')
    expect(cards).toHaveLength(1)
    expect(cards[0].attributes('data-recap-key')).toBe('1y')
  })

  it('全部回顧的 photos 都空 → 整個區塊不渲染', () => {
    const broken = { ...makeRecap('1m', '1 個月前', 3), photos: [] }
    const w = mount(RecapRail, { props: { items: [broken] } })
    expect(w.find('[data-test="recap-rail"]').exists()).toBe(false)
  })

  it('點卡片 → emit select，帶的是整個 recap 物件', async () => {
    const items = [makeRecap('1m', '1 個月前'), makeRecap('2y', '2 年前')]
    const w = mount(RecapRail, { props: { items } })
    await w.findAll('[data-test="recap-card"]')[1].trigger('click')

    const emitted = w.emitted('select')
    expect(emitted).toHaveLength(1)
    expect(emitted?.[0][0]).toEqual(items[1])
  })
})
