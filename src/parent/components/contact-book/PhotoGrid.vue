<script setup lang="ts">
/**
 * 聯絡簿照片牆：最多排出 6 格（第 6 格疊「+N」），點任一格開共用 PhotoLightbox，
 * 可左右瀏覽**全部**照片。先前是 `<a target=_blank>` 開新分頁（LINE 內會跳出 App 內
 * 瀏覽器、回不來），而且 slice(0, 6) 之後第 7 張以後根本看不到。
 */
import { computed, ref } from 'vue'
import PhotoLightbox, { type LightboxPhoto } from '../PhotoLightbox.vue'

interface Photo {
  id?: number
  thumb_url?: string
  display_url: string
}

const props = withDefaults(defineProps<{
  photos?: Photo[]
}>(), {
  photos: () => [],
})

const layout = computed<string>(() => {
  const n = props.photos.length
  if (n === 0) return 'empty'
  if (n === 1) return 'one'
  if (n === 2) return 'two'
  if (n === 3) return 'three'
  return 'grid'
})

const displayed = computed<Photo[]>(() => {
  if (props.photos.length <= 6) return props.photos
  return props.photos.slice(0, 6)
})
const overflow = computed<number>(() => Math.max(0, props.photos.length - 6))

const previewIdx = ref<number | null>(null)
const lightboxPhotos = computed<LightboxPhoto[]>(() =>
  props.photos.map((p, i) => ({ src: p.display_url, alt: `聯絡簿照片 ${i + 1} / ${props.photos.length}` })),
)

function tileLabel(i: number): string {
  const total = props.photos.length
  if (overflow.value > 0 && i === displayed.value.length - 1) {
    return `查看第 ${i + 1} 張照片，還有 ${overflow.value} 張，共 ${total} 張`
  }
  return `查看第 ${i + 1} 張照片，共 ${total} 張`
}
</script>

<template>
  <div v-if="layout !== 'empty'" class="grid" :class="`layout-${layout}`">
    <button
      v-for="(p, i) in displayed"
      :key="p.id || i"
      type="button"
      class="tile"
      :class="{ 'has-overflow': overflow > 0 && i === displayed.length - 1 }"
      :aria-label="tileLabel(i)"
      @click="previewIdx = i"
    >
      <!--
        P2-FE-Parent-3：alt 加序號 + 總數，screen reader 可知第幾張；分母用
        `photos.length`（全部數量）而非 `displayed.length`，因為 overflow 之外
        的照片在 a11y 上仍存在於 collection 中。
      -->
      <img
        :src="p.thumb_url || p.display_url"
        :alt="`聯絡簿照片 ${i + 1} / ${photos.length}`"
        loading="lazy"
        decoding="async"
      />
      <span v-if="overflow > 0 && i === displayed.length - 1" class="overflow" aria-hidden="true">+{{ overflow }}</span>
    </button>
  </div>
  <PhotoLightbox v-model:index="previewIdx" :photos="lightboxPhotos" />
</template>

<style scoped>
.grid {
  display: grid;
  gap: 6px;
}
.layout-one { grid-template-columns: 1fr; }
.layout-two { grid-template-columns: 1fr 1fr; }
.layout-three { grid-template-columns: 1fr 1fr 1fr; }
.layout-grid { grid-template-columns: 1fr 1fr 1fr; }

.tile {
  position: relative;
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  cursor: pointer;
  aspect-ratio: 1;
  border-radius: 12px;
  overflow: hidden;
  background: var(--pt-border-light, #ecf5f9);
}
.layout-one .tile { aspect-ratio: 16 / 10; }

.tile img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 200ms ease;
}
.tile:active img { transform: scale(0.98); }

.overflow {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(27, 68, 89, 0.55);
  color: var(--color-primary-contrast, #fff);
  font-size: 1.375rem;
  font-weight: 700;
}

@media (prefers-reduced-motion: reduce) {
  .tile img { transition: none; }
}
</style>
