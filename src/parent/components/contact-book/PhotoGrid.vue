<script setup>
import { computed } from 'vue'

const props = defineProps({
  photos: { type: Array, default: () => [] },
})

const layout = computed(() => {
  const n = props.photos.length
  if (n === 0) return 'empty'
  if (n === 1) return 'one'
  if (n === 2) return 'two'
  if (n === 3) return 'three'
  return 'grid'
})

const displayed = computed(() => {
  if (props.photos.length <= 6) return props.photos
  return props.photos.slice(0, 6)
})
const overflow = computed(() => Math.max(0, props.photos.length - 6))
</script>

<template>
  <div v-if="layout !== 'empty'" class="grid" :class="`layout-${layout}`">
    <a
      v-for="(p, i) in displayed"
      :key="p.id"
      :href="p.display_url"
      target="_blank"
      rel="noopener"
      class="tile"
      :class="{ 'has-overflow': overflow > 0 && i === displayed.length - 1 }"
    >
      <img :src="p.thumb_url || p.display_url" alt="聯絡簿照片" loading="lazy" decoding="async" />
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
