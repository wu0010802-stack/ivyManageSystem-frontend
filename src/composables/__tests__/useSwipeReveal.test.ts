import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useSwipeReveal } from '../useSwipeReveal'

function fakeTarget() {
  const el = document.createElement('div')
  ;(el as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture = vi.fn()
  ;(el as unknown as { releasePointerCapture: (id: number) => void }).releasePointerCapture = vi.fn()
  return el
}

function pointerEvent(overrides: {
  clientX: number
  pointerId?: number
  currentTarget?: EventTarget | null
}): PointerEvent {
  return {
    clientX: overrides.clientX,
    pointerId: overrides.pointerId ?? 1,
    currentTarget: overrides.currentTarget ?? null,
  } as unknown as PointerEvent
}

describe('useSwipeReveal', () => {
  let matchMediaSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    matchMediaSpy = vi.fn().mockReturnValue({ matches: false })
    vi.stubGlobal('matchMedia', matchMediaSpy)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('向左拖曳超過閾值鬆手：isOpen=true，dragX 定位在 -revealWidth（預設 84），不觸發任何業務動作', () => {
    const { dragX, isOpen, onPointerDown, onPointerMove, onPointerUp } = useSwipeReveal()
    const target = fakeTarget()

    onPointerDown(pointerEvent({ clientX: 0, currentTarget: target }))
    onPointerMove(pointerEvent({ clientX: -60, currentTarget: target })) // 60/84 ≈ 71% > 45%
    onPointerUp(pointerEvent({ clientX: -60, currentTarget: target }))

    expect(isOpen.value).toBe(true)
    expect(dragX.value).toBe(-84)
  })

  it('未達閾值鬆手：isOpen 維持 false，dragX 回彈到 0', () => {
    const { dragX, isOpen, onPointerDown, onPointerMove, onPointerUp } = useSwipeReveal()
    const target = fakeTarget()

    onPointerDown(pointerEvent({ clientX: 0, currentTarget: target }))
    onPointerMove(pointerEvent({ clientX: -10, currentTarget: target })) // 10/84 ≈ 12% < 45%
    onPointerUp(pointerEvent({ clientX: -10, currentTarget: target }))

    expect(isOpen.value).toBe(false)
    expect(dragX.value).toBe(0)
  })

  it('dragX 拖曳中會 clamp 在 [-revealWidth, 0]，不會超出（含向右拖曳的下界防呆）', () => {
    const { dragX, onPointerDown, onPointerMove } = useSwipeReveal()
    const target = fakeTarget()

    onPointerDown(pointerEvent({ clientX: 0, currentTarget: target }))
    onPointerMove(pointerEvent({ clientX: -500, currentTarget: target }))
    expect(dragX.value).toBe(-84)

    onPointerMove(pointerEvent({ clientX: 500, currentTarget: target }))
    expect(dragX.value).toBe(0)
  })

  it('已開啟狀態下再次拖曳，往回拖過閾值鬆手可關閉', () => {
    const { dragX, isOpen, onPointerDown, onPointerMove, onPointerUp } = useSwipeReveal()
    const target = fakeTarget()

    onPointerDown(pointerEvent({ clientX: 0, currentTarget: target }))
    onPointerMove(pointerEvent({ clientX: -84, currentTarget: target }))
    onPointerUp(pointerEvent({ clientX: -84, currentTarget: target }))
    expect(isOpen.value).toBe(true)

    // 已開啟（baseOffset=-84），這次從同一個 startX 只拖回 +50（未達 45% 閾值）：應維持開啟
    onPointerDown(pointerEvent({ clientX: 0, currentTarget: target }))
    onPointerMove(pointerEvent({ clientX: 30, currentTarget: target })) // baseOffset(-84)+30=-54，|−54|/84≈64%>45%
    onPointerUp(pointerEvent({ clientX: 30, currentTarget: target }))
    expect(isOpen.value).toBe(true)
    expect(dragX.value).toBe(-84)

    // 再拖到接近 0（超過閾值的關閉方向）
    onPointerDown(pointerEvent({ clientX: 0, currentTarget: target }))
    onPointerMove(pointerEvent({ clientX: 80, currentTarget: target })) // baseOffset(-84)+80=-4，|−4|/84≈5%<45%
    onPointerUp(pointerEvent({ clientX: 80, currentTarget: target }))
    expect(isOpen.value).toBe(false)
    expect(dragX.value).toBe(0)
  })

  it('close() 可強制收合並歸零 dragX', () => {
    const { dragX, isOpen, onPointerDown, onPointerMove, onPointerUp, close } = useSwipeReveal()
    const target = fakeTarget()

    onPointerDown(pointerEvent({ clientX: 0, currentTarget: target }))
    onPointerMove(pointerEvent({ clientX: -60, currentTarget: target }))
    onPointerUp(pointerEvent({ clientX: -60, currentTarget: target }))
    expect(isOpen.value).toBe(true)

    close()
    expect(isOpen.value).toBe(false)
    expect(dragX.value).toBe(0)
  })

  it('支援自訂 revealWidth / openThresholdRatio', () => {
    const { isOpen, onPointerDown, onPointerMove, onPointerUp } = useSwipeReveal({
      revealWidth: 40,
      openThresholdRatio: 0.5,
    })
    const target = fakeTarget()

    onPointerDown(pointerEvent({ clientX: 0, currentTarget: target }))
    onPointerMove(pointerEvent({ clientX: -30, currentTarget: target })) // clamp to -40，40/40=100%>50%
    onPointerUp(pointerEvent({ clientX: -30, currentTarget: target }))

    expect(isOpen.value).toBe(true)
  })

  it('不同 pointerId 的 move/up 事件會被忽略（多指觸控防呆）', () => {
    const { dragX, isOpen, onPointerDown, onPointerMove, onPointerUp } = useSwipeReveal()
    const target = fakeTarget()

    onPointerDown(pointerEvent({ clientX: 0, pointerId: 1, currentTarget: target }))
    onPointerMove(pointerEvent({ clientX: -60, pointerId: 2, currentTarget: target }))
    expect(dragX.value).toBe(0)
    onPointerUp(pointerEvent({ clientX: -60, pointerId: 2, currentTarget: target }))
    expect(isOpen.value).toBe(false)
  })

  it('拖曳中又來一個 pointerdown（真正多指觸控）不會劫持手勢，原 pointer 之後的 up 仍正常判定', () => {
    const { dragX, isOpen, onPointerDown, onPointerMove, onPointerUp } = useSwipeReveal()
    const target = fakeTarget()

    onPointerDown(pointerEvent({ clientX: 0, pointerId: 1, currentTarget: target }))
    onPointerMove(pointerEvent({ clientX: -30, pointerId: 1, currentTarget: target }))
    expect(dragX.value).toBe(-30)

    onPointerDown(pointerEvent({ clientX: 500, pointerId: 2, currentTarget: target }))
    expect(dragX.value).toBe(-30)

    onPointerMove(pointerEvent({ clientX: -70, pointerId: 1, currentTarget: target }))
    onPointerUp(pointerEvent({ clientX: -70, pointerId: 1, currentTarget: target }))

    expect(isOpen.value).toBe(true)

    onPointerUp(pointerEvent({ clientX: 500, pointerId: 2, currentTarget: target }))
    expect(isOpen.value).toBe(true)
  })

  it('pointercancel 定位回目前 isOpen 對應位置，不改變 isOpen', () => {
    const { dragX, isOpen, onPointerDown, onPointerMove, onPointerCancel } = useSwipeReveal()
    const target = fakeTarget()

    onPointerDown(pointerEvent({ clientX: 0, currentTarget: target }))
    onPointerMove(pointerEvent({ clientX: -60, currentTarget: target }))
    onPointerCancel(pointerEvent({ clientX: -60, currentTarget: target }))

    expect(isOpen.value).toBe(false)
    expect(dragX.value).toBe(0)
  })

  it('prefers-reduced-motion 為 true 時 reboundInstant 為 true，但開闔邏輯不受影響', () => {
    matchMediaSpy.mockReturnValue({ matches: true })
    const { isOpen, reboundInstant, onPointerDown, onPointerMove, onPointerUp } = useSwipeReveal()
    const target = fakeTarget()

    expect(reboundInstant.value).toBe(false)

    onPointerDown(pointerEvent({ clientX: 0, currentTarget: target }))
    expect(reboundInstant.value).toBe(true)

    onPointerMove(pointerEvent({ clientX: -60, currentTarget: target }))
    onPointerUp(pointerEvent({ clientX: -60, currentTarget: target }))
    expect(isOpen.value).toBe(true)
  })
})
