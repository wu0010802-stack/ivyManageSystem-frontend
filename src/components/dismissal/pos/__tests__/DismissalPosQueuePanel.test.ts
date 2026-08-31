import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DismissalPosQueuePanel from '../DismissalPosQueuePanel.vue'
import DismissalPosQueueCard from '../DismissalPosQueueCard.vue'
import type { PosQueueItem } from '@/types/dismissalPos'

function item(overrides: Partial<PosQueueItem> = {}): PosQueueItem {
  return {
    id: 'staging:1',
    phase: 'staging',
    studentId: 1,
    studentName: '王小明',
    classroomName: '陽光班',
    source: 'onsite',
    countdown: { startedAt: Date.now(), durationMs: 5000 },
    call: null,
    ...overrides,
  }
}

describe('DismissalPosQueuePanel', () => {
  it('items 為空時顯示空狀態，不渲染任何卡片', () => {
    const w = mount(DismissalPosQueuePanel, { props: { items: [] } })
    expect(w.find('.pos-queue-panel__empty').exists()).toBe(true)
    expect(w.findAllComponents(DismissalPosQueueCard)).toHaveLength(0)
  })

  it('items 非空時依序渲染對應數量的 DismissalPosQueueCard，不顯示空狀態', () => {
    const items = [item({ id: 'staging:1', studentId: 1 }), item({ id: 42, studentId: 2, phase: 'active' })]
    const w = mount(DismissalPosQueuePanel, { props: { items } })
    expect(w.find('.pos-queue-panel__empty').exists()).toBe(false)
    const cards = w.findAllComponents(DismissalPosQueueCard)
    expect(cards).toHaveLength(2)
    expect(cards[0].props('item')).toEqual(items[0])
    expect(cards[1].props('item')).toEqual(items[1])
  })

  it('子卡片 emit cancel 會原樣轉呼叫端（帶正確 item）', async () => {
    const items = [item()]
    const w = mount(DismissalPosQueuePanel, { props: { items } })
    const card = w.findComponent(DismissalPosQueueCard)
    await card.vm.$emit('cancel', items[0])

    const emitted = w.emitted('cancel')
    expect(emitted).toHaveLength(1)
    expect(emitted?.[0]).toEqual([items[0]])
  })

  it('子卡片 emit confirm-pickup 會原樣轉呼叫端（帶正確 item，T-022）', async () => {
    const items = [item()]
    const w = mount(DismissalPosQueuePanel, { props: { items } })
    const card = w.findComponent(DismissalPosQueueCard)
    await card.vm.$emit('confirm-pickup', items[0])

    const emitted = w.emitted('confirm-pickup')
    expect(emitted).toHaveLength(1)
    expect(emitted?.[0]).toEqual([items[0]])
  })

  it('每張卡片都用 item.id 當 :key（透過 TransitionGroup 渲染，具備 dcall-list 進出場 class 命名）', () => {
    const items = [item({ id: 'staging:1' }), item({ id: 'staging:2', studentId: 2 })]
    const w = mount(DismissalPosQueuePanel, { props: { items } })
    expect(w.find('.pos-queue-panel__list').exists()).toBe(true)
  })
})
