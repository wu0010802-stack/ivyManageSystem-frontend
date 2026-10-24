<script setup lang="ts">
/**
 * 家長端共用照片 lightbox（全螢幕瀏覽一組照片）。
 *
 * 行為比照照片牆（ChildPhotosView）既有的 lightbox：role="dialog"、開啟時焦點移入、
 * 關閉時還原、ESC 關閉、←／→ 換張、Tab 以 useFocusTrap 鎖在覆蓋層內、點黑幕關閉；
 * 另外補手機左右滑換張。Teleport 到 body，不受頁面 transform／下拉刷新容器影響。
 *
 * 用法：<PhotoLightbox v-model:index="previewIdx" :photos="[{ src, alt }]" />
 * index 為 null 時關閉。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useFocusTrap } from '../composables/useFocusTrap'
import { useBodyLock } from '@/composables/useBodyLock'

export interface LightboxPhoto {
  src: string
  alt?: string
}

const props = defineProps<{
  photos: LightboxPhoto[]
  index: number | null
}>()

const emit = defineEmits<{
  'update:index': [value: number | null]
}>()

/** 水平滑動超過這個距離才換張，避免捲動或點擊被誤判 */
const SWIPE_THRESHOLD_PX = 50

const rootRef = ref<HTMLElement | null>(null)
const { trapTab } = useFocusTrap(rootRef)
const { lock, unlock } = useBodyLock()
let previousActiveElement: Element | null = null
let touchStartX: number | null = null

const current = computed(() => (props.index === null ? null : props.photos[props.index] ?? null))
const atStart = computed(() => (props.index ?? 0) <= 0)
const atEnd = computed(() => (props.index ?? 0) >= props.photos.length - 1)

function close(): void {
  emit('update:index', null)
}
function prev(): void {
  if (props.index !== null && !atStart.value) emit('update:index', props.index - 1)
}
function next(): void {
  if (props.index !== null && !atEnd.value) emit('update:index', props.index + 1)
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    next()
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    prev()
  } else if (e.key === 'Tab') {
    trapTab(e)
  }
}

function onTouchStart(e: TouchEvent): void {
  touchStartX = e.touches[0]?.clientX ?? null
}
function onTouchEnd(e: TouchEvent): void {
  if (touchStartX === null) return
  const dx = (e.changedTouches[0]?.clientX ?? touchStartX) - touchStartX
  touchStartX = null
  if (dx <= -SWIPE_THRESHOLD_PX) next()
  else if (dx >= SWIPE_THRESHOLD_PX) prev()
}

watch(
  () => props.index !== null,
  async (isOpen, wasOpen) => {
    if (isOpen && !wasOpen) {
      previousActiveElement = typeof document !== 'undefined' ? document.activeElement : null
      lock()
      await nextTick()
      rootRef.value?.focus()
    } else if (!isOpen && wasOpen) {
      unlock()
      const target = previousActiveElement as HTMLElement | null
      previousActiveElement = null
      if (target && typeof target.focus === 'function') nextTick(() => target.focus())
    }
  },
)

onBeforeUnmount(unlock)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="current"
      ref="rootRef"
      class="photo-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="放大檢視照片"
      tabindex="-1"
      data-testid="photo-lightbox"
      @click.self="close"
      @keydown="onKeydown"
      @touchstart.passive="onTouchStart"
      @touchend="onTouchEnd"
    >
      <button class="nav prev" type="button" :disabled="atStart" aria-label="上一張" @click="prev">
        <span class="material-symbols-rounded" aria-hidden="true">chevron_left</span>
      </button>
      <img :src="current.src" :alt="current.alt || `照片 ${(index ?? 0) + 1}`" />
      <button class="nav next" type="button" :disabled="atEnd" aria-label="下一張" @click="next">
        <span class="material-symbols-rounded" aria-hidden="true">chevron_right</span>
      </button>
      <button class="close" type="button" aria-label="關閉" @click="close">
        <span class="material-symbols-rounded" aria-hidden="true">close</span>
      </button>
      <div class="counter" aria-live="polite">{{ (index ?? 0) + 1 }} / {{ photos.length }}</div>
    </div>
  </Teleport>
</template>

<style scoped>
.photo-lightbox {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.94);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
}
.photo-lightbox:focus { outline: none; }
.photo-lightbox img {
  max-width: 95vw;
  max-height: 88vh;
  object-fit: contain;
}
.nav,
.close {
  position: absolute;
  background: rgba(255, 255, 255, 0.16);
  color: var(--color-primary-contrast, #fff);
  border: none;
  border-radius: 50%;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.nav {
  top: 50%;
  transform: translateY(-50%);
  width: 48px;
  height: 48px;
}
.nav:disabled { opacity: 0.25; cursor: not-allowed; }
.nav .material-symbols-rounded { font-size: 28px; }
.nav.prev { left: 12px; }
.nav.next { right: 12px; }
.close {
  top: max(16px, env(safe-area-inset-top));
  right: 16px;
  width: var(--touch-target-min, 44px);
  height: var(--touch-target-min, 44px);
}
.close .material-symbols-rounded { font-size: 22px; }
.counter {
  position: absolute;
  bottom: max(24px, env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  color: var(--color-primary-contrast, #fff);
  background: rgba(0, 0, 0, 0.4);
  border-radius: 999px;
  font-size: 0.8125rem;
  font-weight: 500;
  padding: 6px 14px;
  font-variant-numeric: tabular-nums;
}
</style>
