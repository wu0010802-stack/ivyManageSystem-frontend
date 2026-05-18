<script setup lang="ts">
import { computed } from 'vue'

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
</script>

<template>
  <div v-if="layout !== 'empty'" class="grid" :class="`layout-${layout}`">
    <a
      v-for="(p, i) in displayed"
      :key="p.id || i"
      :href="p.display_url"
      target="_blank"
      rel="noopener"
      class="tile"
      :class="{ 'has-overflow': overflow > 0 && i === displayed.length - 1 }"
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
      <span v-if="overflow > 0 && i === displayed.length - 1" class="overflow">+{{ overflow }}</span>
    </a>
  </div>
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
  color: #fff;
  font-size: 22px;
  font-weight: 700;
}

@media (prefers-reduced-motion: reduce) {
  .tile img { transition: none; }
}
</style>
