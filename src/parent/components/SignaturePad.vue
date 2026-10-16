<script setup lang="ts">
/**
 * 手寫簽名板。
 *
 * - 紙本語意：簽名區 light/dark 恆為白底深色筆（--color-signature-paper／-ink 不隨主題翻轉）。
 *   舊版 strokeStyle 設成 'var(--pt-text-strong)'，canvas 不認 CSS 變數而永遠用預設黑筆，
 *   背景卻是會翻成深藍的 --neutral-0，dark 下筆跡幾乎看不見。
 * - 匯出 PNG：底色維持透明、只有深色筆跡（與舊版相同的後端契約），不受主題影響。
 * - 寬度跟容器走（CSS 100%），高度用 `height` prop；畫布 backing store 乘 devicePixelRatio，
 *   retina 不再糊。容器寬度改變（轉向、側欄收合）時重建畫布並重畫已簽的筆畫。
 * - `width` prop 只作為量不到容器尺寸時（例如 SSR／測試環境）的退路寬度。
 */
import { onMounted, onUnmounted, ref } from 'vue'

const emit = defineEmits<{ (e: 'clear'): void }>()

const props = withDefaults(defineProps<{
  width?: number
  height?: number
}>(), {
  width: 320,
  height: 160,
})

/** 讀不到 CSS token 時的筆色（與 globals.css --color-signature-ink 同值） */
const INK_FALLBACK = '#191c19'
const LINE_WIDTH = 2.4

interface Point { x: number; y: number }

const canvas = ref<HTMLCanvasElement | null>(null)
let ctx: CanvasRenderingContext2D | null = null
let drawing = false
let hasInk = false
/** 已簽筆畫（CSS px 座標），畫布重建時據此重畫 */
let strokes: Point[][] = []
let cssWidth = 0
let cssHeight = 0
let resizeObserver: ResizeObserver | null = null

function inkColor(el: HTMLCanvasElement): string {
  const token = getComputedStyle(el).getPropertyValue('--color-signature-ink').trim()
  return token || INK_FALLBACK
}

function strokePath(points: Point[]): void {
  if (!ctx || points.length === 0) return
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  // 單點（只點一下）也畫出圓點：lineCap round 讓零長度線段呈現為點
  for (const p of points.length === 1 ? points : points.slice(1)) ctx.lineTo(p.x, p.y)
  ctx.stroke()
}

/** 依目前 CSS 尺寸與 DPR 重建 backing store，設定筆刷並重畫既有筆畫 */
function setupCanvas(): void {
  const el = canvas.value
  if (!el) return
  cssWidth = el.clientWidth || props.width
  cssHeight = el.clientHeight || props.height
  const dpr = Math.max(1, window.devicePixelRatio || 1)
  el.width = Math.round(cssWidth * dpr)
  el.height = Math.round(cssHeight * dpr)
  ctx = el.getContext('2d')
  if (!ctx) return
  // 改 width/height 會重置 context 狀態，所以每次重建都要重設
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.lineWidth = LINE_WIDTH
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = inkColor(el)
  for (const s of strokes) strokePath(s)
}

function onResize(): void {
  const el = canvas.value
  if (!el) return
  // 只在寬高真的變了才重建（避免 backing store 重設觸發多餘重畫）
  if (Math.abs(el.clientWidth - cssWidth) < 1 && Math.abs(el.clientHeight - cssHeight) < 1) return
  setupCanvas()
}

function pos(e: MouseEvent | TouchEvent): Point {
  const rect = canvas.value!.getBoundingClientRect()
  const t = 'touches' in e ? e.touches[0] : e
  return { x: t.clientX - rect.left, y: t.clientY - rect.top }
}

function onDown(e: MouseEvent | TouchEvent): void {
  e.preventDefault()
  if (!ctx) return
  drawing = true
  hasInk = true
  const p = pos(e)
  strokes.push([p])
  strokePath([p])
}

function onMove(e: MouseEvent | TouchEvent): void {
  if (!drawing || !ctx) return
  e.preventDefault()
  const p = pos(e)
  const current = strokes[strokes.length - 1]
  const last = current[current.length - 1]
  current.push(p)
  ctx.beginPath()
  ctx.moveTo(last.x, last.y)
  ctx.lineTo(p.x, p.y)
  ctx.stroke()
}

function onUp(): void {
  drawing = false
}

onMounted(() => {
  setupCanvas()
  if (typeof ResizeObserver !== 'undefined' && canvas.value) {
    resizeObserver = new ResizeObserver(onResize)
    resizeObserver.observe(canvas.value)
  }
})

onUnmounted(() => {
  drawing = false
  resizeObserver?.disconnect()
  resizeObserver = null
})

function clear(): void {
  if (!ctx || !canvas.value) return
  ctx.clearRect(0, 0, cssWidth, cssHeight)
  strokes = []
  hasInk = false
  // F06：mouseup 先於 click 冒泡，父層此時讀到的 hasInk 還是 true；
  // 清除本身同步通知父層「已無筆跡」。
  emit('clear')
}

function isEmpty(): boolean {
  return !hasInk
}

function toBlob(): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.value!.toBlob((b) => resolve(b), 'image/png')
  })
}

defineExpose({ clear, isEmpty, toBlob })
</script>

<template>
  <div class="signature-pad">
    <canvas
      ref="canvas"
      :width="width"
      :height="height"
      :style="{ height: `${height}px` }"
      @mousedown="onDown"
      @mousemove="onMove"
      @mouseup="onUp"
      @mouseleave="onUp"
      @touchstart="onDown"
      @touchmove="onMove"
      @touchend="onUp"
    />
    <button type="button" class="clear-btn" @click="clear">清除</button>
  </div>
</template>

<style scoped>
.signature-pad {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  min-width: 0;
}
canvas {
  display: block;
  box-sizing: border-box;
  width: 100%;
  /* 紙本語意：恆白底，邊框用 --m3-outline（≥3:1，白底白卡上才看得出簽名範圍） */
  border: 2px dashed var(--m3-outline, #717971);
  background: var(--color-signature-paper, #ffffff);
  border-radius: 6px;
  touch-action: none;
  cursor: crosshair;
}
.clear-btn {
  align-self: flex-end;
  min-height: var(--touch-target-min, 44px);
  padding: 4px 16px;
  font-size: var(--text-sm, 13px);
  background: var(--pt-surface-mute);
  border: 1px solid #d0d2d5;
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
}
</style>
