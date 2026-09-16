<script setup lang="ts">
/**
 * 相簿回顧橫向卡片列（照片牆頂部入口）。
 *
 * 一張卡 ＝ 一個回顧時間窗。空窗的時間窗後端不回傳，所以這裡不做過濾；
 * `items` 為空時整個區塊不渲染，照片牆回到沒有回顧的原版面。
 *
 * 設計稿：docs/mockups/2026-09-16-parent-album-recap.html（frame 1）
 */
import { computed } from 'vue'
import type { PhotoRecap } from '../../api/childPhotos'
import { formatRecapRange, recapThumbSrc } from './recapFormat'

const props = defineProps<{ items: PhotoRecap[] }>()

const emit = defineEmits<{ select: [recap: PhotoRecap] }>()

/**
 * 只留真的打得開的回顧。
 *
 * 空窗的時間窗後端本來就不回傳，所以這**不是**在做「前端自行過濾空窗」；
 * 這是防畸形 payload（photo_count > 0 但 photos 是空陣列）渲染出一張
 * 點開只有一片全黑的卡。
 */
const openableItems = computed<PhotoRecap[]>(() =>
  props.items.filter((recap) => (recap.photos?.length ?? 0) > 0),
)

/** 封面取該回顧的第一張縮圖；沒有 photos（只給了 count）時不渲染 img。 */
function coverSrc(recap: PhotoRecap): string {
  const first = recap.photos?.[0]
  return first ? recapThumbSrc(first) : ''
}

function rangeText(recap: PhotoRecap): string {
  return formatRecapRange(recap.range_start, recap.range_end)
}

function cardLabel(recap: PhotoRecap): string {
  const range = rangeText(recap)
  return `${recap.label}的回顧${range ? `，${range}` : ''}，共 ${recap.photo_count} 張照片`
}
</script>

<template>
  <section
    v-if="openableItems.length > 0"
    class="recap-sec"
    data-test="recap-rail"
    aria-labelledby="recap-rail-title"
  >
    <div class="recap-head">
      <h2 id="recap-rail-title" class="pt-section-title">回顧</h2>
      <span class="recap-hint">同一天前的照片</span>
    </div>

    <div class="recap-rail" role="list">
      <div v-for="item in openableItems" :key="item.key" class="recap-stack" role="listitem">
        <!-- 疊紙：暗示這張卡背後是一疊照片而非單張 -->
        <span class="sheet s1" aria-hidden="true" />
        <span class="sheet s2" aria-hidden="true" />
        <button
          type="button"
          class="recap-card"
          data-test="recap-card"
          :data-recap-key="item.key"
          :aria-label="cardLabel(item)"
          @click="emit('select', item)"
        >
          <img
            v-if="coverSrc(item)"
            class="cover"
            :src="coverSrc(item)"
            alt=""
            loading="lazy"
            decoding="async"
          >
          <span class="veil" aria-hidden="true" />
          <span class="count">{{ item.photo_count }} 張</span>
          <span class="body">
            <span class="when">{{ item.label }}</span>
            <span class="sub">{{ rangeText(item) }}</span>
          </span>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.recap-sec {
  margin-top: 6px;
}

.recap-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 0 16px 10px;
}
/* .pt-section-title 自帶 margin-bottom，這裡的間距由 .recap-head 的 padding 給 */
.recap-head .pt-section-title {
  margin: 0;
}
.recap-hint {
  font-size: 12px;
  font-weight: 500;
  color: var(--pt-text-faint);
}

.recap-rail {
  display: flex;
  gap: 12px;
  /* overflow-x: auto 會把 overflow-y 一併變成 auto，疊紙與陰影只能靠 padding 留空間 */
  padding: 4px 16px 14px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
.recap-rail::-webkit-scrollbar {
  display: none;
}

.recap-stack {
  flex: none;
  position: relative;
  width: 132px;
  aspect-ratio: 3 / 4;
  scroll-snap-align: start;
}
.sheet {
  position: absolute;
  border-radius: 20px;
  background: var(--m3-surface-container-high);
  border: 1px solid var(--pt-border-light);
}
.sheet.s1 {
  inset: 8px -5px -6px 5px;
  opacity: 0.55;
}
.sheet.s2 {
  inset: 4px -2px -3px 2px;
  opacity: 0.8;
}

.recap-card {
  position: absolute;
  inset: 0;
  border: 0;
  padding: 0;
  border-radius: 20px;
  overflow: hidden;
  cursor: pointer;
  text-align: left;
  background: var(--m3-surface-container-high);
  box-shadow: var(--pt-shadow-card);
  transition: transform var(--motion-quick) var(--motion-spring);
}
.recap-card:active {
  transform: scale(0.96);
}
.recap-card:focus-visible {
  outline: 2px solid var(--m3-primary);
  outline-offset: 3px;
}
/* 內縮亮邊，讓卡片在深色照片上仍有「一張紙」的邊界 */
.recap-card::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  pointer-events: none;
}

.cover {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
/* 照片上的文字沒有可用的 token（底色是任意照片），一律用黑色漸層壓出對比 */
.veil {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to top,
    rgba(0, 0, 0, 0.74) 0%,
    rgba(0, 0, 0, 0.28) 42%,
    rgba(0, 0, 0, 0) 72%
  );
}

.body {
  position: absolute;
  inset: auto 0 0 0;
  padding: 10px 11px 11px;
  color: var(--pt-on-accent);
}
.when {
  display: block;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: -0.01em;
  line-height: 1.2;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
}
.sub {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  font-weight: 500;
  opacity: 0.9;
  font-variant-numeric: tabular-nums;
}

.count {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  color: var(--pt-on-accent);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: reduce) {
  .recap-card {
    transition: none;
  }
}
</style>
