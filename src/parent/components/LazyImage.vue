<script setup>
/**
 * 家長端懶載圖片：IntersectionObserver + native loading="lazy" fallback。
 *
 * Props:
 *  - src       (必填) 圖片 URL
 *  - alt       a11y 文字（預設 ''）
 *  - aspectRatio CSS aspect-ratio，避免載入時跳版（預設 '1 / 1'）
 *  - rootMargin IntersectionObserver rootMargin（預設 '200px'）
 *  - placeholder 'shimmer' | 'solid'（預設 'shimmer'）
 *
 * Slots:
 *  - error   載入失敗時顯示
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  src: { type: String, required: true },
  alt: { type: String, default: '' },
  aspectRatio: { type: String, default: '1 / 1' },
  rootMargin: { type: String, default: '200px' },
  placeholder: { type: String, default: 'shimmer' },
})

const containerRef = ref(null)
const inView = ref(false)
const errored = ref(false)
let observer = null

onMounted(() => {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
    inView.value = true
    return
  }
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting && e.intersectionRatio > 0) {
          inView.value = true
          observer?.disconnect()
          break
        }
      }
    },
    { rootMargin: props.rootMargin },
  )
  if (containerRef.value) observer.observe(containerRef.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})

function onError() { errored.value = true }
</script>

<template>
  <div
    ref="containerRef"
    class="pt-lazyimg"
    :class="{ 'pt-lazyimg-shimmer': placeholder === 'shimmer' && !inView }"
    :style="{ aspectRatio }"
  >
    <img
      v-if="!errored"
      :src="inView ? src : undefined"
      :alt="alt"
      loading="lazy"
      decoding="async"
      @error="onError"
    />
    <slot v-else name="error">
      <span class="pt-lazyimg-fallback" aria-hidden="true">⚠</span>
    </slot>
  </div>
</template>

<style scoped>
.pt-lazyimg {
  display: block;
  width: 100%;
  background: var(--pt-surface-mute, #f0f2f5);
  overflow: hidden;
}
.pt-lazyimg img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.pt-lazyimg-shimmer {
  background: linear-gradient(90deg,
    var(--pt-surface-mute) 0%,
    var(--pt-surface-mute-soft) 50%,
    var(--pt-surface-mute) 100%);
  background-size: 200% 100%;
  animation: pt-shimmer 1.4s ease-in-out infinite;
}
.pt-lazyimg-fallback {
  display: flex; align-items: center; justify-content: center;
  width: 100%; height: 100%;
  color: var(--pt-text-muted, #94a3b8);
  font-size: 24px;
}
</style>
