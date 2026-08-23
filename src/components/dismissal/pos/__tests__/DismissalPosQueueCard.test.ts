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

/** 讓 body 元素有非零寬度，模擬真實 layout，讓 useSwipeToCancel 的閾值計算生效。 */
function withMeasuredWidth(wrapper: ReturnType<typeof mount>, width = 200) {
  const body = wrapper.find('[data-testid="pos-queue-card-body"]').element as HTMLElement
  Object.defineProperty(body, 'offsetWidth', { value: width, configurable: true })
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

  describe('proxy（代理接送）卡片內容（T-021）', () => {
    function proxyItem(overrides: Partial<PosQueueItem> = {}) {
      return activeItem({
        source: 'proxy',
        call: {
          id: 42,
          student_name: '王小明',
          classroom_name: '陽光班',
          status: 'pending',
          request_source: 'proxy',
          requested_at: '2026-08-23T07:00:00',
          arrived_at: null,
          expected_arrival_at: '2026-08-23T07:00:00',
          person_name: '林阿姨',
          person_relation: '阿姨',
          pickup_code: '482913',
        },
        ...overrides,
      })
    }

    it('顯示代理人姓名（含關係）與明碼取件碼', () => {
      const w = mount(DismissalPosQueueCard, { props: { item: proxyItem() } })
      expect(w.find('.pos-queue-card__proxy-person').text()).toBe('林阿姨（阿姨）')
      expect(w.find('.pos-queue-card__proxy-code').text()).toBe('取件碼 482913')
    })

    it('person_relation 缺值時只顯示姓名，不顯示空括號', () => {
      const w = mount(DismissalPosQueueCard, {
        props: { item: proxyItem({ call: { ...proxyItem().call!, person_relation: null } }) },
      })
      expect(w.find('.pos-queue-card__proxy-person').text()).toBe('林阿姨')
    })

    it('不顯示 ETA 倒數文案，改顯示委託接送靜態狀態文字', () => {
      const w = mount(DismissalPosQueueCard, {
        props: {
          item: proxyItem(),
          now: new Date('2026-08-23T07:05:00+08:00').getTime(),
        },
      })
      expect(w.find('.pos-queue-card__eta-flag').exists()).toBe(false)
      expect(w.text()).toContain('今日委託接送，等待到場')
      expect(w.text()).not.toContain('已通知教師端')
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
      expect(w.find('.pos-queue-card__waiting-flag').text()).toContain('已通知教師端')
      expect(w.find('.pos-queue-card__eta-flag').exists()).toBe(false)
    })
  })

  describe('swipe 取消', () => {
    it('swipe 手勢完成後 emit cancel(item) 恰一次', async () => {
      const item = activeItem()
      const w = mount(DismissalPosQueueCard, { props: { item } })
      const body = withMeasuredWidth(w)

      await body.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, pointerId: 1 }))
      await body.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, pointerId: 1 })) // 100/200=50%>40%
      await body.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, pointerId: 1 }))

      const emitted = w.emitted('cancel')
      expect(emitted).toHaveLength(1)
      expect(emitted?.[0]).toEqual([item])
    })

    it('未達閾值的 swipe 不會 emit cancel', async () => {
      const w = mount(DismissalPosQueueCard, { props: { item: activeItem() } })
      const body = withMeasuredWidth(w)

      await body.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, pointerId: 1 }))
      await body.dispatchEvent(new PointerEvent('pointermove', { clientX: 20, pointerId: 1 })) // 20/200=10%<40%
      await body.dispatchEvent(new PointerEvent('pointerup', { clientX: 20, pointerId: 1 }))

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
