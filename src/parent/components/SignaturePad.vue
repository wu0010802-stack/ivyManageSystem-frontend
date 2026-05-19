<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

withDefaults(defineProps<{
  width?: number
  height?: number
}>(), {
  width: 320,
  height: 160,
})

const canvas = ref<HTMLCanvasElement | null>(null)
let ctx: CanvasRenderingContext2D | null = null
let drawing = false
let hasInk = false

function pos(e: MouseEvent | TouchEvent): { x: number; y: number } {
  const rect = canvas.value!.getBoundingClientRect()
  const t = 'touches' in e ? e.touches[0] : e
  return { x: t.clientX - rect.left, y: t.clientY - rect.top }
}

function onDown(e: MouseEvent | TouchEvent): void {
  e.preventDefault()
  drawing = true
  hasInk = true
  const p = pos(e)
  ctx!.beginPath()
  ctx!.moveTo(p.x, p.y)
}

function onMove(e: MouseEvent | TouchEvent): void {
  if (!drawing) return
  e.preventDefault()
  const p = pos(e)
  ctx!.lineTo(p.x, p.y)
  ctx!.stroke()
}

function onUp(): void {
  drawing = false
}

onMounted(() => {
  ctx = canvas.value!.getContext('2d')
  if (!ctx) return
  ctx.lineWidth = 2.2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = 'var(--pt-text-strong)'
})

onUnmounted(() => {
  drawing = false
})

function clear(): void {
  if (!ctx || !canvas.value) return
  ctx.clearRect(0, 0, canvas.value.width, canvas.value.height)
  hasInk = false
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
  display: inline-flex;
  flex-direction: column;
  gap: 6px;
}
canvas {
  border: 1px dashed var(--pt-text-disabled);
  background: var(--neutral-0);
  border-radius: 6px;
  touch-action: none;
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
