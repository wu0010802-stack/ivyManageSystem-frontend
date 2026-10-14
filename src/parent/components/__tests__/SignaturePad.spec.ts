import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import SignaturePad from '../SignaturePad.vue'

/**
 * SignaturePad：紙本語意（恆白底深色筆）、寬度跟容器、乘 DPR、resize 重畫。
 * jsdom 沒有 canvas 2d 與 layout，這裡用假 context 記錄呼叫、用 stub 提供 clientWidth/Height。
 */
interface FakeCtx {
  beginPath: ReturnType<typeof vi.fn>
  moveTo: ReturnType<typeof vi.fn>
  lineTo: ReturnType<typeof vi.fn>
  stroke: ReturnType<typeof vi.fn>
  clearRect: ReturnType<typeof vi.fn>
  setTransform: ReturnType<typeof vi.fn>
  lineWidth: number
  lineCap: string
  lineJoin: string
  strokeStyle: string
}

let ctx: FakeCtx
let box = { w: 400, h: 160 }
let roCallback: (() => void) | null = null
const wrappers: VueWrapper[] = []

function fakeCtx(): FakeCtx {
  return {
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), clearRect: vi.fn(),
    setTransform: vi.fn(), lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', strokeStyle: '#000000',
  }
}

beforeEach(() => {
  ctx = fakeCtx()
  box = { w: 400, h: 160 }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => ctx as unknown as CanvasRenderingContext2D,
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'clientWidth', 'get').mockImplementation(() => box.w)
  vi.spyOn(HTMLCanvasElement.prototype, 'clientHeight', 'get').mockImplementation(() => box.h)
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(
    { left: 0, top: 0, right: box.w, bottom: box.h, width: box.w, height: box.h, x: 0, y: 0, toJSON: () => ({}) },
  )
  vi.stubGlobal('devicePixelRatio', 2)
  vi.stubGlobal('ResizeObserver', class {
    constructor(cb: () => void) { roCallback = cb }
    observe(): void {}
    disconnect(): void { roCallback = null }
  })
})

afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  roCallback = null
})

function mountPad(props: Record<string, unknown> = {}): VueWrapper {
  const w = mount(SignaturePad, { props, attachTo: document.body })
  wrappers.push(w)
  return w
}

describe('SignaturePad 畫布', () => {
  it('筆色是實際色值（canvas 不認 CSS 變數），不再是 var(--...) 字串', () => {
    mountPad()
    expect(ctx.strokeStyle).not.toContain('var(')
    expect(ctx.strokeStyle.toLowerCase()).toBe('#191c19')
  })

  it('backing store 寬度跟容器、乘 devicePixelRatio，並以 setTransform 對齊 CSS 座標', () => {
    const w = mountPad({ width: 320, height: 160 })
    const el = w.find('canvas').element as HTMLCanvasElement
    expect(el.width).toBe(800)
    expect(el.height).toBe(320)
    expect(ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0)
    expect(el.style.height).toBe('160px')
  })

  it('容器寬度改變時重建畫布並重畫已簽筆畫', async () => {
    const w = mountPad()
    const canvas = w.find('canvas')
    await canvas.trigger('mousedown', { clientX: 10, clientY: 10 })
    await canvas.trigger('mousemove', { clientX: 60, clientY: 40 })
    await canvas.trigger('mouseup')
    ctx.lineTo.mockClear()

    box.w = 300
    roCallback?.()
    expect((canvas.element as HTMLCanvasElement).width).toBe(600)
    // 重畫：一筆兩點 → 一次 moveTo + 一次 lineTo
    expect(ctx.lineTo).toHaveBeenCalledWith(60, 40)
    expect((w.vm as unknown as { isEmpty(): boolean }).isEmpty()).toBe(false)
  })

  it('尺寸沒變的 resize 通知不重建畫布', () => {
    mountPad()
    ctx.setTransform.mockClear()
    roCallback?.()
    expect(ctx.setTransform).not.toHaveBeenCalled()
  })

  it('只點一下也畫出點並視為有筆跡', async () => {
    const w = mountPad()
    await w.find('canvas').trigger('mousedown', { clientX: 5, clientY: 6 })
    expect(ctx.moveTo).toHaveBeenCalledWith(5, 6)
    expect(ctx.lineTo).toHaveBeenCalledWith(5, 6)
    expect((w.vm as unknown as { isEmpty(): boolean }).isEmpty()).toBe(false)
  })

  it('清除：清畫布、emit clear、isEmpty 回 true，resize 後也不會把舊筆畫畫回來', async () => {
    const w = mountPad()
    const canvas = w.find('canvas')
    await canvas.trigger('mousedown', { clientX: 10, clientY: 10 })
    await canvas.trigger('mousemove', { clientX: 30, clientY: 30 })
    await canvas.trigger('mouseup')
    await w.find('.clear-btn').trigger('click')
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 400, 160)
    expect(w.emitted('clear')).toHaveLength(1)
    expect((w.vm as unknown as { isEmpty(): boolean }).isEmpty()).toBe(true)

    ctx.lineTo.mockClear()
    box.w = 500
    roCallback?.()
    expect(ctx.lineTo).not.toHaveBeenCalled()
  })
})

describe('SignaturePad 紙本語意（樣式契約）', () => {
  const raw = readFileSync(resolve(__dirname, '../SignaturePad.vue'), 'utf-8')
  const sfc = raw.slice(raw.indexOf('<style'))
  const globals = readFileSync(resolve(__dirname, '../../styles/globals.css'), 'utf-8')
  const darkStart = globals.indexOf(":root[data-theme='dark']")

  it('畫布底用恆白的 --color-signature-paper，不用會翻深藍的 --neutral-0', () => {
    expect(sfc).toMatch(/background: var\(--color-signature-paper/)
    expect(sfc).not.toContain('--neutral-0')
  })

  it('紙／筆 token 只在 light 定義、dark 刻意不覆寫', () => {
    expect(globals.slice(0, darkStart)).toMatch(/--color-signature-paper:\s*#ffffff/)
    expect(globals.slice(0, darkStart)).toMatch(/--color-signature-ink:\s*#191c19/)
    expect(globals.slice(darkStart)).not.toContain('--color-signature-')
  })
})
