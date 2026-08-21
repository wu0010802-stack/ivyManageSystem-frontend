import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useSwipeToCancel } from '../useSwipeToCancel'

/** 模擬一個寬度固定的 currentTarget（jsdom/happy-dom 預設 offsetWidth 為 0，測試需自行指定）。 */
function fakeTarget(width: number) {
  const el = document.createElement('div')
  Object.defineProperty(el, 'offsetWidth', { value: width, configurable: true })
  // happy-dom 的 HTMLElement 未必實作 pointer capture API，測試環境補上 no-op stub
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

describe('useSwipeToCancel', () => {
  let matchMediaSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    matchMediaSpy = vi.fn().mockReturnValue({ matches: false })
    vi.stubGlobal('matchMedia', matchMediaSpy)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('拖曳超過閾值鬆手才觸發 onCommit', () => {
    const onCommit = vi.fn()
    const { dragX, onPointerDown, onPointerMove, onPointerUp } = useSwipeToCancel({ onCommit })
    const target = fakeTarget(200) // 閾值 40% → 80px

    onPointerDown(pointerEvent({ clientX: 0, currentTarget: target }))
    onPointerMove(pointerEvent({ clientX: 100, currentTarget: target })) // 100/200 = 50% > 40%
    expect(dragX.value).toBe(100)
    onPointerUp(pointerEvent({ clientX: 100, currentTarget: target }))

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(dragX.value).toBe(0) // 觸發後歸零
  })

  it('未達閾值鬆手會回彈（dragX 歸零）且不觸發 onCommit', () => {
    const onCommit = vi.fn()
    const { dragX, onPointerDown, onPointerMove, onPointerUp } = useSwipeToCancel({ onCommit })
    const target = fakeTarget(200) // 閾值 80px

    onPointerDown(pointerEvent({ clientX: 0, currentTarget: target }))
    onPointerMove(pointerEvent({ clientX: 50, currentTarget: target })) // 50/200 = 25% < 40%
    onPointerUp(pointerEvent({ clientX: 50, currentTarget: target }))

    expect(onCommit).not.toHaveBeenCalled()
    expect(dragX.value).toBe(0)
  })

  it('支援自訂 thresholdRatio', () => {
    const onCommit = vi.fn()
    const { onPointerDown, onPointerMove, onPointerUp } = useSwipeToCancel({
      onCommit,
      thresholdRatio: 0.2,
    })
    const target = fakeTarget(200) // 20% → 40px

    onPointerDown(pointerEvent({ clientX: 0, currentTarget: target }))
    onPointerMove(pointerEvent({ clientX: 50, currentTarget: target })) // 25% > 20%
    onPointerUp(pointerEvent({ clientX: 50, currentTarget: target }))

    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('反方向（向左）拖曳一樣用絕對值判斷閾值', () => {
    const onCommit = vi.fn()
    const { onPointerDown, onPointerMove, onPointerUp } = useSwipeToCancel({ onCommit })
    const target = fakeTarget(200)

    onPointerDown(pointerEvent({ clientX: 100, currentTarget: target }))
    onPointerMove(pointerEvent({ clientX: -20, currentTarget: target })) // dx = -120，|dx|/200 = 60%
    onPointerUp(pointerEvent({ clientX: -20, currentTarget: target }))

    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('未量到寬度（currentTarget 非 HTMLElement）時保守視為未達閾值，不誤觸發', () => {
    const onCommit = vi.fn()
    const { onPointerDown, onPointerMove, onPointerUp } = useSwipeToCancel({ onCommit })

    onPointerDown(pointerEvent({ clientX: 0, currentTarget: null }))
    onPointerMove(pointerEvent({ clientX: 999, currentTarget: null }))
    onPointerUp(pointerEvent({ clientX: 999, currentTarget: null }))

    expect(onCommit).not.toHaveBeenCalled()
  })

  it('不同 pointerId 的 move/up 事件會被忽略（多指觸控防呆）', () => {
    const onCommit = vi.fn()
    const { dragX, onPointerDown, onPointerMove, onPointerUp } = useSwipeToCancel({ onCommit })
    const target = fakeTarget(200)

    onPointerDown(pointerEvent({ clientX: 0, pointerId: 1, currentTarget: target }))
    onPointerMove(pointerEvent({ clientX: 100, pointerId: 2, currentTarget: target })) // 別的手指
    expect(dragX.value).toBe(0)
    onPointerUp(pointerEvent({ clientX: 100, pointerId: 2, currentTarget: target }))
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('拖曳中又來一個 pointerdown（真正多指觸控）不會劫持手勢，原 pointer 之後的 up 仍正常判定', () => {
    const onCommit = vi.fn()
    const { dragX, onPointerDown, onPointerMove, onPointerUp } = useSwipeToCancel({ onCommit })
    const target = fakeTarget(200) // 閾值 80px

    onPointerDown(pointerEvent({ clientX: 0, pointerId: 1, currentTarget: target }))
    onPointerMove(pointerEvent({ clientX: 30, pointerId: 1, currentTarget: target }))
    expect(dragX.value).toBe(30)

    // 第二根手指意外按下：不應覆寫 startX/activePointerId，也不應改變目前的 dragX
    onPointerDown(pointerEvent({ clientX: 500, pointerId: 2, currentTarget: target }))
    expect(dragX.value).toBe(30)

    // 原本那根手指繼續拖到超過閾值再放開，應正常觸發 onCommit（不會因為劫持而卡死）
    onPointerMove(pointerEvent({ clientX: 100, pointerId: 1, currentTarget: target }))
    onPointerUp(pointerEvent({ clientX: 100, pointerId: 1, currentTarget: target }))

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(dragX.value).toBe(0)

    // 劫持失敗的第二根手指本來就沒有被接受為 active pointer，它的 up 不應再觸發任何東西
    onPointerUp(pointerEvent({ clientX: 500, pointerId: 2, currentTarget: target }))
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('onCommit 執行當下 dragX 仍保留最後拖曳位置，執行完才歸零', () => {
    const seenDragXAtCommit: number[] = []
    const onCommit = vi.fn(() => {
      seenDragXAtCommit.push(dragXRef.dragX.value)
    })
    const dragXRef = useSwipeToCancel({ onCommit })
    const target = fakeTarget(200)

    dragXRef.onPointerDown(pointerEvent({ clientX: 0, currentTarget: target }))
    dragXRef.onPointerMove(pointerEvent({ clientX: 120, currentTarget: target }))
    dragXRef.onPointerUp(pointerEvent({ clientX: 120, currentTarget: target }))

    expect(seenDragXAtCommit).toEqual([120])
    expect(dragXRef.dragX.value).toBe(0) // 呼叫完歸零
  })

  it('pointercancel 比照回彈處理，不觸發 onCommit', () => {
    const onCommit = vi.fn()
    const { dragX, onPointerDown, onPointerMove, onPointerCancel } = useSwipeToCancel({ onCommit })
    const target = fakeTarget(200)

    onPointerDown(pointerEvent({ clientX: 0, currentTarget: target }))
    onPointerMove(pointerEvent({ clientX: 150, currentTarget: target }))
    onPointerCancel(pointerEvent({ clientX: 150, currentTarget: target }))

    expect(onCommit).not.toHaveBeenCalled()
    expect(dragX.value).toBe(0)
  })

  it('prefers-reduced-motion 為 true 時 reboundInstant 為 true，但觸發邏輯不受影響', () => {
    matchMediaSpy.mockReturnValue({ matches: true })
    const onCommit = vi.fn()
    const { reboundInstant, onPointerDown, onPointerMove, onPointerUp } = useSwipeToCancel({
      onCommit,
    })
    const target = fakeTarget(200)

    expect(reboundInstant.value).toBe(false) // 尚未 pointerdown 前預設 false

    onPointerDown(pointerEvent({ clientX: 0, currentTarget: target }))
    expect(reboundInstant.value).toBe(true)

    onPointerMove(pointerEvent({ clientX: 100, currentTarget: target }))
    onPointerUp(pointerEvent({ clientX: 100, currentTarget: target }))
    expect(onCommit).toHaveBeenCalledTimes(1) // 邏輯不因 reduced-motion 改變
  })

  it('prefers-reduced-motion 為 false 時 reboundInstant 維持 false', () => {
    matchMediaSpy.mockReturnValue({ matches: false })
    const onCommit = vi.fn()
    const { reboundInstant, onPointerDown } = useSwipeToCancel({ onCommit })
    const target = fakeTarget(200)

    onPointerDown(pointerEvent({ clientX: 0, currentTarget: target }))
    expect(reboundInstant.value).toBe(false)
  })
})
