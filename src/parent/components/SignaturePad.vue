<script setup>
import { onMounted, onUnmounted, ref } from 'vue'

const props = defineProps({
  width: { type: Number, default: 320 },
  height: { type: Number, default: 160 },
})

const canvas = ref(null)
let ctx = null
let drawing = false
let hasInk = false

function pos(e) {
  const rect = canvas.value.getBoundingClientRect()
  const t = e.touches ? e.touches[0] : e
  return { x: t.clientX - rect.left, y: t.clientY - rect.top }
}

function onDown(e) {
  e.preventDefault()
  drawing = true
  hasInk = true
  const p = pos(e)
  ctx.beginPath()
  ctx.moveTo(p.x, p.y)
}

function onMove(e) {
  if (!drawing) return
  e.preventDefault()
  const p = pos(e)
  ctx.lineTo(p.x, p.y)
  ctx.stroke()
}

function onUp() {
  drawing = false
}

onMounted(() => {
  ctx = canvas.value.getContext('2d')
  ctx.lineWidth = 2.2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#222'
})

onUnmounted(() => {
  drawing = false
})

function clear() {
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.value.width, canvas.value.height)
  hasInk = false
}

function isEmpty() {
  return !hasInk
}

function toBlob() {
  return new Promise((resolve) => {
    canvas.value.toBlob((b) => resolve(b), 'image/png')
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
  border: 1px dashed #aaa;
  background: #fff;
  border-radius: 6px;
  touch-action: none;
}
.clear-btn {
  align-self: flex-end;
  padding: 4px 12px;
  font-size: 13px;
  background: #f0f2f5;
  border: 1px solid #d0d2d5;
  border-radius: 4px;
}
</style>
