import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import DismissalPosQueueCard from '../DismissalPosQueueCard.vue'
import type { PosQueueItem } from '@/types/dismissalPos'

function stagingItem(overrides: Partial<PosQueueItem> = {}): PosQueueItem {
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

function activeItem(overrides: Partial<PosQueueItem> = {}): PosQueueItem {
  return {
    id: 42,
    phase: 'active',
    studentId: 1,
    studentName: '王小明',
    classroomName: '陽光班',
    source: 'onsite',
    countdown: null,
    call: {
      id: 42,
      student_name: '王小明',
      classroom_name: '陽光班',
      status: 'pending',
      request_source: 'staff',
      requested_at: '2026-08-21T07:00:00',
      arrived_at: '2026-08-21T07:00:00',
      expected_arrival_at: null,
    },
    ...overrides,
  }
}

function doneItem(overrides: Partial<PosQueueItem> = {}): PosQueueItem {
  return {
    id: 43,
    phase: 'done',
    studentId: 1,
    studentName: '王小明',
    classroomName: '陽光班',
    source: 'onsite',
    countdown: null,
    call: {
      id: 43,
      student_name: '王小明',
      classroom_name: '陽光班',
      status: 'completed',
      request_source: 'staff',
      requested_at: '2026-08-21T07:00:00',
      arrived_at: '2026-08-21T07:00:00',
      expected_arrival_at: null,
      completed_at: '2026-08-21T07:12:00',
    },
    ...overrides,
  }
}

/** 補上 pointer capture no-op stub（happy-dom 未必實作），供 useSwipeReveal 呼叫。 */
function withPointerCaptureStub(wrapper: ReturnType<typeof mount>) {
  const body = wrapper.find('[data-testid="pos-queue-card-body"]').element as HTMLElement
  body.setPointerCapture = vi.fn()
  body.releasePointerCapture = vi.fn()
  return body
}

describe('DismissalPosQueueCard', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('來源標籤', () => {
    it.each([
      ['onsite', '現場'],
      ['reservation', '預約'],
      ['proxy', '代理'],
    ] as const)('source=%s 顯示「%s」', (source, label) => {
      const w = mount(DismissalPosQueueCard, {
        props: { item: activeItem({ source }) },
      })
      const tag = w.find('.pos-queue-card__source-tag')
      expect(tag.text()).toBe(label)
      expect(tag.classes()).toContain(`pos-queue-card__source-tag--${source}`)
    })

    it('三種來源標籤樣式互斥（同一張卡只會有一個 source-tag modifier class）', () => {
      const w = mount(DismissalPosQueueCard, {
        props: { item: activeItem({ source: 'reservation' }) },
      })
      const tag = w.find('.pos-queue-card__source-tag')
      const modifiers = tag
        .classes()
        .filter(c => c.startsWith('pos-queue-card__source-tag--'))
      expect(modifiers).toEqual(['pos-queue-card__source-tag--reservation'])
    })
  })

  describe('倒數條顯示邏輯', () => {
    it('staging 狀態渲染 DismissalPosCountdownBar', () => {
      const w = mount(DismissalPosQueueCard, { props: { item: stagingItem() } })
      expect(w.find('.pos-countdown-bar__track').exists()).toBe(true)
    })

    it('active 狀態不渲染倒數條', () => {
      const w = mount(DismissalPosQueueCard, { props: { item: activeItem() } })
      expect(w.find('.pos-countdown-bar__track').exists()).toBe(false)
    })

    it('active 且家長預約未抵達：顯示 ETA，不顯示等候標記', () => {
      const w = mount(DismissalPosQueueCard, {
        props: {
          item: activeItem({
            source: 'reservation',
            call: {
              id: 42,
              student_name: '王小明',
              classroom_name: '陽光班',
              status: 'pending',
              request_source: 'parent',
              requested_at: '2026-08-21T07:00:00',
              arrived_at: null,
              expected_arrival_at: '2026-08-21T07:40:00',
            },
          }),
          now: new Date('2026-08-21T07:28:00+08:00').getTime(),
        },
      })
      expect(w.find('.pos-queue-card__eta-flag').exists()).toBe(true)
      expect(w.find('.pos-queue-card__waiting-flag').exists()).toBe(false)
    })

    it('active 且現場/已抵達：顯示「已通知教師端，等待確認」', () => {
      const w = mount(DismissalPosQueueCard, { props: { item: activeItem() } })
      const flag = w.find('.pos-queue-card__waiting-flag')
      expect(flag.text()).toContain('已通知教師端')
      expect(flag.classes()).not.toContain('pos-queue-card__waiting-flag--ack')
      expect(w.find('.pos-queue-card__eta-flag').exists()).toBe(false)
    })

    it('active 且老師已確認（acknowledged）：等候標記進入第二階段「老師已收到」', () => {
      const base = activeItem()
      const w = mount(DismissalPosQueueCard, {
        props: { item: { ...base, call: { ...base.call!, status: 'acknowledged' } } },
      })
      const flag = w.find('.pos-queue-card__waiting-flag')
      expect(flag.text()).toContain('老師已收到')
      expect(flag.classes()).toContain('pos-queue-card__waiting-flag--ack')
    })
  })

  describe('swipe 取消（滑開才出現取消鈕，需再點按鈕才真正取消）', () => {
    it('向左滑動超過開啟閾值鬆手：卡片彈開露出取消鈕，但不會立即 emit cancel', async () => {
      const w = mount(DismissalPosQueueCard, { props: { item: activeItem() } })
      const body = withPointerCaptureStub(w)

      await body.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, pointerId: 1 }))
      await body.dispatchEvent(new PointerEvent('pointermove', { clientX: -60, pointerId: 1 })) // 60/84≈71%>45%
      await body.dispatchEvent(new PointerEvent('pointerup', { clientX: -60, pointerId: 1 }))

      expect(w.emitted('cancel')).toBeUndefined()
      expect(w.find('.pos-queue-card__cancel-btn').attributes('disabled')).toBeUndefined()
    })

    it('彈開後點擊取消鈕才 emit cancel(item) 恰一次，並收合回關閉狀態', async () => {
      const item = activeItem()
      const w = mount(DismissalPosQueueCard, { props: { item } })
      const body = withPointerCaptureStub(w)

      await body.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, pointerId: 1 }))
      await body.dispatchEvent(new PointerEvent('pointermove', { clientX: -60, pointerId: 1 }))
      await body.dispatchEvent(new PointerEvent('pointerup', { clientX: -60, pointerId: 1 }))

      await w.find('.pos-queue-card__cancel-btn').trigger('click')

      const emitted = w.emitted('cancel')
      expect(emitted).toHaveLength(1)
      expect(emitted?.[0]).toEqual([item])
      expect(w.find('.pos-queue-card__cancel-btn').attributes('disabled')).toBeDefined()
    })

    it('未達開啟閾值的 swipe 會回彈，取消鈕維持 disabled，點擊也不會 emit cancel', async () => {
      const w = mount(DismissalPosQueueCard, { props: { item: activeItem() } })
      const body = withPointerCaptureStub(w)

      await body.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, pointerId: 1 }))
      await body.dispatchEvent(new PointerEvent('pointermove', { clientX: -10, pointerId: 1 })) // 10/84≈12%<45%
      await body.dispatchEvent(new PointerEvent('pointerup', { clientX: -10, pointerId: 1 }))

      const btn = w.find('.pos-queue-card__cancel-btn')
      expect(btn.attributes('disabled')).toBeDefined()
      await btn.trigger('click')
      expect(w.emitted('cancel')).toBeUndefined()
    })
  })

  describe('done（已放學）卡', () => {
    it('顯示「已放學 HH:MM」標記與降階 class，不顯示等候標記／ETA／倒數條', () => {
      const w = mount(DismissalPosQueueCard, { props: { item: doneItem() } })
      expect(w.find('.pos-queue-card').classes()).toContain('pos-queue-card--done')
      expect(w.find('.pos-queue-card__done-flag').text()).toContain('已放學 07:12')
      expect(w.find('.pos-queue-card__waiting-flag').exists()).toBe(false)
      expect(w.find('.pos-queue-card__eta-flag').exists()).toBe(false)
      expect(w.find('.pos-countdown-bar__track').exists()).toBe(false)
    })

    it('completed_at 缺值時仍顯示「已放學」，不顯示時間', () => {
      const item = doneItem()
      item.call = { ...item.call!, completed_at: undefined }
      const w = mount(DismissalPosQueueCard, { props: { item } })
      expect(w.find('.pos-queue-card__done-flag').text().trim()).toBe('✅ 已放學')
    })

    it('swipe 手勢不會 emit cancel（completed 沒有取消語意），取消鈕也不渲染', async () => {
      const w = mount(DismissalPosQueueCard, { props: { item: doneItem() } })
      expect(w.find('.pos-queue-card__reveal').exists()).toBe(false)
      const body = withPointerCaptureStub(w)

      await body.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, pointerId: 1 }))
      await body.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, pointerId: 1 }))
      await body.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, pointerId: 1 }))

      expect(w.emitted('cancel')).toBeUndefined()
    })
  })

  it('classroomName/studentName 缺值時有防禦性文字，不顯示空白', () => {
    const w = mount(DismissalPosQueueCard, {
      props: { item: activeItem({ studentName: '', classroomName: '' }) },
    })
    expect(w.find('.pos-queue-card__name').text()).toBe('未知學生')
    expect(w.find('.pos-queue-card__room').text()).toBe('未分班')
  })
})
